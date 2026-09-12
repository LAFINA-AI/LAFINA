import asyncio
import base64
import binascii
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Literal, Annotated
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from backend.app.config import get_settings
from backend.app.database import get_db
from backend.app.models.account import Account
from backend.app.models.session import AuthSession
from backend.app.models.ai_usage import AIUsage
from backend.app.security.auth import get_current_user_and_session
from backend.app.services.capabilities import resolve_account_capabilities
from backend.app.clients.deepseek import DeepSeekClient, DeepSeekError
from backend.app.clients.gemini_tts import GeminiTtsClient, GeminiTtsError
from backend.app.services.flashcards import (
    FLASHCARD_SYSTEM_PROMPT,
    Flashcard,
    FlashcardParseError,
    build_user_prompt,
    merge_cards,
    parse_flashcard_json,
)
from backend.app.services.pdf_text import PdfTextError, chunk_text, extract_pdf_text

router = APIRouter(prefix="/v1/ai", tags=["ai"])
settings = get_settings()

LAFINA_SYSTEM_INSTRUCTION = (
    "You are LAFINA, an intelligent, warm, voice-first AI academic scheduling assistant for students. "
    "Always introduce yourself as LAFINA when asked, greeted, or introduced. "
    "Your primary function is helping students organize their academic life: scheduling classes, study sessions, midterm exams, "
    "assignments, reminders, and time blocks, while also answering academic and general questions. "
    "Rule 1: NEVER refuse, decline, or lecture a user about their requested schedule times (including 3 AM, late night, or early morning hours). Always accept and confirm any requested time, date, or duration without judgment. "
    "Rule 2: When a user asks you to schedule, remind, or plan a task, confirm warmly as LAFINA that the schedule item has been created with the exact title, date, time, and duration requested."
    "Rule 3: Do not use emojis in the chat"
)


def get_deepseek_client(request: Request) -> DeepSeekClient:
    """Dependency helper providing the application-scoped DeepSeekClient."""
    client: DeepSeekClient | None = getattr(request.app.state, "deepseek_client", None)
    if client is None:
        return DeepSeekClient(settings=settings)
    return client


def get_gemini_tts_client(request: Request) -> GeminiTtsClient:
    """Dependency helper providing the application-scoped GeminiTtsClient."""
    client: GeminiTtsClient | None = getattr(request.app.state, "gemini_tts_client", None)
    if client is None:
        return GeminiTtsClient(settings=settings)
    return client


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=4090)


class AIChatRequest(BaseModel):
    requestId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    messages: list[ChatMessage] = Field(..., min_length=1, max_length=10)


class AIChatResponse(BaseModel):
    requestId: str
    reply: str
    model: str
    usage: dict
    createdAt: str


class AITtsRequest(BaseModel):
    requestId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str = Field(..., min_length=1, max_length=512)


class AITtsResponse(BaseModel):
    requestId: str
    audioBase64: str
    mimeType: str = "audio/wav"
    model: str
    voice: str
    createdAt: str


@router.post("/chat", response_model=AIChatResponse)
async def chat_proxy(
    req: AIChatRequest,
    auth_data: Annotated[tuple[Account, AuthSession], Depends(get_current_user_and_session)],
    db: AsyncSession = Depends(get_db),
    deepseek: DeepSeekClient = Depends(get_deepseek_client),
):
    account, _ = auth_data
    owner_id = account.id

    # Enforce role-based access for Online AI from live DB Account
    cap_res = await resolve_account_capabilities(account, db)
    is_entitled = (
        account.role in ("student_pro", "admin", "business")
        or account.system_role == "admin"
        or account.subscription_plan in ("student_pro", "business")
        or cap_res.effective_subscription_plan in ("student_pro", "business")
        or cap_res.system_role == "admin"
    )
    if not is_entitled or not account.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Online AI requires a student_pro or business subscription. Please upgrade your account."
        )

    now = datetime.now(timezone.utc)
    now_str = now.isoformat()

    # Validate total character count across messages (max 8,000 chars)
    total_chars = sum(len(m.content) for m in req.messages)
    if total_chars > 8000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Total input messages character count exceeds limit of 8,000 characters."
        )

    # Rate limiting: Max 10 requests per minute for chat
    one_min_ago = now - timedelta(minutes=1)
    min_stmt = select(func.count(AIUsage.id)).where(
        AIUsage.owner_id == owner_id,
        AIUsage.request_type == "chat",
        AIUsage.created_at >= one_min_ago
    )
    min_count = (await db.execute(min_stmt)).scalar() or 0
    if min_count >= settings.MAX_AI_REQUESTS_PER_MIN:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Per-minute AI request limit exceeded. Please wait a moment before trying again."
        )

    # Rate limiting: Max 100 requests per 24 hours for chat
    twenty_four_hrs_ago = now - timedelta(hours=24)
    day_stmt = select(func.count(AIUsage.id)).where(
        AIUsage.owner_id == owner_id,
        AIUsage.request_type == "chat",
        AIUsage.created_at >= twenty_four_hrs_ago
    )
    day_count = (await db.execute(day_stmt)).scalar() or 0
    if day_count >= settings.MAX_AI_REQUESTS_PER_DAY:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Daily AI request quota reached (100 requests/day)."
        )

    formatted_messages = [
        {"role": "system", "content": LAFINA_SYSTEM_INSTRUCTION}
    ] + [{"role": m.role, "content": m.content} for m in req.messages]

    try:
        reply_text, usage_data = await deepseek.chat_completion(
            messages=formatted_messages,
            user_id=str(account.id),
            request_id=req.requestId
        )
    except DeepSeekError as err:
        raise HTTPException(
            status_code=err.status_code,
            detail=err.message
        )

    # Record AI usage only after successful completion
    db.add(AIUsage(
        owner_id=owner_id,
        request_type="chat",
        prompt_tokens=usage_data.get("prompt_tokens", 0),
        completion_tokens=usage_data.get("completion_tokens", 0),
        created_at=now
    ))
    await db.commit()

    return AIChatResponse(
        requestId=req.requestId,
        reply=reply_text,
        model=settings.DEEPSEEK_MODEL,
        usage=usage_data,
        createdAt=now_str
    )


@router.post("/tts", response_model=AITtsResponse)
async def tts_proxy(
    req: AITtsRequest,
    auth_data: Annotated[tuple[Account, AuthSession], Depends(get_current_user_and_session)],
    db: AsyncSession = Depends(get_db),
    gemini_tts: GeminiTtsClient = Depends(get_gemini_tts_client)
):
    account, _ = auth_data
    owner_id = account.id

    # Enforce access for TTS from live DB Account (student_pro or business)
    cap_res = await resolve_account_capabilities(account, db)
    is_entitled = (
        account.role in ("student_pro", "business")
        or account.subscription_plan in ("student_pro", "business")
        or cap_res.effective_subscription_plan in ("student_pro", "business")
    )
    if not is_entitled or not account.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Gemini TTS requires a student_pro or business subscription. Please upgrade your account."
        )

    trimmed_text = req.text.strip()
    if not trimmed_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text field cannot be empty or whitespace only."
        )

    now = datetime.now(timezone.utc)
    now_str = now.isoformat()

    # Rate limiting: Max 10 TTS requests per minute
    one_min_ago = now - timedelta(minutes=1)
    min_stmt = select(func.count(AIUsage.id)).where(
        AIUsage.owner_id == owner_id,
        AIUsage.request_type == "tts",
        AIUsage.created_at >= one_min_ago
    )
    min_count = (await db.execute(min_stmt)).scalar() or 0
    if min_count >= settings.MAX_TTS_REQUESTS_PER_MIN:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Per-minute TTS request limit exceeded. Please wait a moment before trying again."
        )

    # Rate limiting: Max 100 TTS requests per 24 hours
    twenty_four_hrs_ago = now - timedelta(hours=24)
    day_stmt = select(func.count(AIUsage.id)).where(
        AIUsage.owner_id == owner_id,
        AIUsage.request_type == "tts",
        AIUsage.created_at >= twenty_four_hrs_ago
    )
    day_count = (await db.execute(day_stmt)).scalar() or 0
    if day_count >= settings.MAX_TTS_REQUESTS_PER_DAY:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Daily TTS request quota reached (100 requests/day)."
        )

    try:
        audio_base64, usage_data = await gemini_tts.synthesize_speech(
            text=trimmed_text,
            request_id=req.requestId
        )
    except GeminiTtsError as err:
        raise HTTPException(
            status_code=err.status_code,
            detail=err.message
        )

    # Record AI usage only after successful completion
    db.add(AIUsage(
        owner_id=owner_id,
        request_type="tts",
        prompt_tokens=usage_data.get("prompt_tokens", len(trimmed_text)),
        completion_tokens=usage_data.get("completion_tokens", 0),
        created_at=now
    ))
    await db.commit()

    return AITtsResponse(
        requestId=req.requestId,
        audioBase64=audio_base64,
        mimeType="audio/wav",
        model=settings.GEMINI_TTS_MODEL,
        voice=settings.GEMINI_TTS_VOICE,
        createdAt=now_str
    )


# ── Flashcards ────────────────────────────────────────────────────────────
# A PDF is not something DeepSeek accepts, so the document is turned into text
# here and only the text is sent upstream. One upload becomes several model
# calls — one per chunk — which is why this endpoint has a budget of its own
# rather than sharing the chat allowance.

MAX_FLASHCARD_PDF_BYTES = 15 * 1024 * 1024
MAX_FLASHCARD_PAGES = 40
MAX_FLASHCARD_CHUNKS = 6
MAX_FLASHCARD_CONCURRENCY = 3
MAX_FLASHCARD_REQUESTS_PER_MIN = 3
MAX_FLASHCARD_REQUESTS_PER_DAY = 20
MAX_FLASHCARDS_PER_DECK = 200


class FlashcardItem(BaseModel):
    question: str
    answer: str


class AIFlashcardRequest(BaseModel):
    requestId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str = Field(default="document.pdf", max_length=255)
    contentBase64: str = Field(..., min_length=16)
    maxCards: int = Field(default=40, ge=5, le=120)


class AIFlashcardResponse(BaseModel):
    requestId: str
    deckTitle: str
    cards: list[FlashcardItem]
    totalPages: int
    pagesRead: int
    ocrPages: list[int]
    chunkCount: int
    model: str
    usage: dict
    warnings: list[str]
    createdAt: str


def _is_ai_entitled(account: Account, cap_res) -> bool:
    return (
        account.role in ("student_pro", "admin", "business")
        or account.system_role == "admin"
        or account.subscription_plan in ("student_pro", "business")
        or cap_res.effective_subscription_plan in ("student_pro", "business")
        or cap_res.system_role == "admin"
    )


async def _enforce_flashcard_quota(db: AsyncSession, owner_id, now: datetime) -> None:
    for window, limit, message in (
        (
            timedelta(minutes=1),
            MAX_FLASHCARD_REQUESTS_PER_MIN,
            "Give the last deck a moment to finish before generating another.",
        ),
        (
            timedelta(hours=24),
            MAX_FLASHCARD_REQUESTS_PER_DAY,
            f"Daily flashcard limit reached ({MAX_FLASHCARD_REQUESTS_PER_DAY} documents/day).",
        ),
    ):
        stmt = select(func.count(AIUsage.id)).where(
            AIUsage.owner_id == owner_id,
            AIUsage.request_type == "flashcards",
            AIUsage.created_at >= now - window,
        )
        used = (await db.execute(stmt)).scalar() or 0
        if used >= limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=message,
            )


def _deck_title(filename: str) -> str:
    stem = (filename or "document.pdf").rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    if stem.lower().endswith(".pdf"):
        stem = stem[:-4]
    stem = re.sub(r"[_\-]+", " ", stem).strip()
    return (stem[:80] or "Flashcards").strip()


@router.post("/flashcards", response_model=AIFlashcardResponse)
async def flashcards_from_pdf(
    req: AIFlashcardRequest,
    auth_data: Annotated[tuple[Account, AuthSession], Depends(get_current_user_and_session)],
    db: AsyncSession = Depends(get_db),
    deepseek: DeepSeekClient = Depends(get_deepseek_client),
):
    """Builds a flashcard deck from an uploaded PDF.

    The PDF arrives base64-encoded because the desktop app's cloud transport
    carries JSON only. Extraction and OCR are blocking work, so they run in a
    worker thread rather than on the event loop.
    """
    account, _ = auth_data

    cap_res = await resolve_account_capabilities(account, db)
    if not _is_ai_entitled(account, cap_res) or not account.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Flashcard generation requires a student_pro or business subscription. "
                "Please upgrade your account."
            ),
        )

    now = datetime.now(timezone.utc)
    await _enforce_flashcard_quota(db, account.id, now)

    try:
        pdf_bytes = base64.b64decode(req.contentBase64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file could not be decoded.",
        )

    if len(pdf_bytes) > MAX_FLASHCARD_PDF_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"That PDF is larger than {MAX_FLASHCARD_PDF_BYTES // (1024 * 1024)} MB. "
                "Split it and try again."
            ),
        )

    try:
        document = await asyncio.to_thread(
            extract_pdf_text, pdf_bytes, max_pages=MAX_FLASHCARD_PAGES
        )
    except PdfTextError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)

    chunks = chunk_text(document.text)
    warnings = list(document.warnings)
    if len(chunks) > MAX_FLASHCARD_CHUNKS:
        warnings.append(
            f"The document was long, so cards come from the first {MAX_FLASHCARD_CHUNKS} sections."
        )
        chunks = chunks[:MAX_FLASHCARD_CHUNKS]
    if not chunks:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No readable text was found in that PDF.",
        )

    deck_title = _deck_title(req.filename)
    per_chunk = max(6, min(40, -(-req.maxCards // len(chunks)) + 2))
    semaphore = asyncio.Semaphore(MAX_FLASHCARD_CONCURRENCY)
    totals = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    async def run_chunk(index: int, chunk: str) -> list[Flashcard]:
        async with semaphore:
            reply, usage = await deepseek.json_completion(
                messages=[
                    {"role": "system", "content": FLASHCARD_SYSTEM_PROMPT},
                    {"role": "user", "content": build_user_prompt(chunk, per_chunk, deck_title)},
                ],
                user_id=str(account.id),
                request_id=f"{req.requestId}#{index}",
                model=settings.DEEPSEEK_FLASHCARD_MODEL,
            )
        for key in totals:
            totals[key] += usage.get(key, 0)
        return parse_flashcard_json(reply)

    results = await asyncio.gather(
        *(run_chunk(index, chunk) for index, chunk in enumerate(chunks)),
        return_exceptions=True,
    )

    batches: list[list[Flashcard]] = []
    failures: list[BaseException] = []
    for result in results:
        if isinstance(result, BaseException):
            failures.append(result)
        else:
            batches.append(result)

    if not batches:
        first = failures[0] if failures else None
        if isinstance(first, DeepSeekError):
            raise HTTPException(status_code=first.status_code, detail=first.message)
        if isinstance(first, FlashcardParseError):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="The model did not return usable flashcards. Try again.",
            )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Flashcards could not be generated from that document.",
        )

    if failures:
        # A partial deck is still worth having; say so rather than pretending
        # the document was fully covered.
        warnings.append(
            f"{len(failures)} of {len(chunks)} sections could not be processed and were skipped."
        )

    cards = merge_cards(batches, limit=min(MAX_FLASHCARDS_PER_DECK, req.maxCards))
    if not cards:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Nothing testable was found in that document.",
        )

    db.add(
        AIUsage(
            owner_id=account.id,
            request_type="flashcards",
            prompt_tokens=totals["prompt_tokens"],
            completion_tokens=totals["completion_tokens"],
            created_at=now,
        )
    )
    await db.commit()

    return AIFlashcardResponse(
        requestId=req.requestId,
        deckTitle=deck_title,
        cards=[FlashcardItem(**card.as_dict()) for card in cards],
        totalPages=document.total_pages,
        pagesRead=document.pages_read,
        ocrPages=document.ocr_page_numbers,
        chunkCount=len(chunks),
        model=settings.DEEPSEEK_FLASHCARD_MODEL,
        usage=totals,
        warnings=warnings,
        createdAt=now.isoformat(),
    )
