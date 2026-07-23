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
from backend.app.clients.deepseek import DeepSeekClient, DeepSeekError

router = APIRouter(prefix="/v1/ai", tags=["ai"])
settings = get_settings()


def get_deepseek_client(request: Request) -> DeepSeekClient:
    """Dependency helper providing the application-scoped DeepSeekClient."""
    client: DeepSeekClient | None = getattr(request.app.state, "deepseek_client", None)
    if client is None:
        return DeepSeekClient(settings=settings)
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


@router.post("/chat", response_model=AIChatResponse)
async def chat_proxy(
    req: AIChatRequest,
    auth_data: Annotated[tuple[Account, AuthSession], Depends(get_current_user_and_session)],
    db: AsyncSession = Depends(get_db),
    deepseek: DeepSeekClient = Depends(get_deepseek_client)
):
    account, _ = auth_data
    owner_id = account.id

    # Enforce role-based entitlement for Online AI from live DB Account
    if account.role not in ("student_pro", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Online AI requires a student_pro subscription. Please upgrade your account."
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

    # Rate limiting: Max 10 requests per minute
    one_min_ago = now - timedelta(minutes=1)
    min_stmt = select(func.count(AIUsage.id)).where(
        AIUsage.owner_id == owner_id,
        AIUsage.created_at >= one_min_ago
    )
    min_count = (await db.execute(min_stmt)).scalar() or 0
    if min_count >= settings.MAX_AI_REQUESTS_PER_MIN:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Per-minute AI request limit exceeded. Please wait a moment before trying again."
        )

    # Rate limiting: Max 100 requests per 24 hours
    twenty_four_hrs_ago = now - timedelta(hours=24)
    day_stmt = select(func.count(AIUsage.id)).where(
        AIUsage.owner_id == owner_id,
        AIUsage.created_at >= twenty_four_hrs_ago
    )
    day_count = (await db.execute(day_stmt)).scalar() or 0
    if day_count >= settings.MAX_AI_REQUESTS_PER_DAY:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Daily AI request quota reached (100 requests/day)."
        )

    formatted_messages = [{"role": m.role, "content": m.content} for m in req.messages]

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
