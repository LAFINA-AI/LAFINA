from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response, status, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from backend.app.config import get_settings
from backend.app.database import engine, Base
import backend.app.models  # noqa: F401
from backend.app.api.v1 import auth, sync, ai, businesses, business_sync, business_chat, meetings
from backend.app.database import get_db
from backend.app.services.capabilities import resolve_account_capabilities
from backend.app.admin import setup_admin
from backend.app.clients.deepseek import DeepSeekClient
from backend.app.clients.gemini_tts import GeminiTtsClient
from sqlalchemy.ext.asyncio import AsyncSession

settings = get_settings()
deepseek_client = DeepSeekClient(settings=settings)
gemini_tts_client = GeminiTtsClient(settings=settings)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize HTTP client pools
    await deepseek_client.start()
    await gemini_tts_client.start()
    app.state.deepseek_client = deepseek_client
    app.state.gemini_tts_client = gemini_tts_client

    # Auto-create tables in dev/test environment if PostgreSQL is available
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        if settings.ADMIN_EMAIL and settings.ADMIN_PASSWORD:
            from backend.scripts.create_admin import create_admin
            await create_admin(settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD)
    except Exception as e:
        print(f"[Warning] Startup initialization note: {e}")
    yield
    await deepseek_client.close()
    await gemini_tts_client.close()
    await engine.dispose()


app = FastAPI(
    title="LAFINA Cloud API",
    description="FastAPI Backend for LAFINA Offline-First Voice Scheduler (Sprint 7 & 8)",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
    redoc_url=None
)

# Enforce 1 MiB max body size middleware
@app.middleware("http")
async def limit_body_size_middleware(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > settings.MAX_BODY_SIZE_BYTES:
        return JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={"detail": "Request payload exceeds maximum allowed size of 1 MiB."}
        )
    return await call_next(request)

# Security headers middleware
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# Disable CORS by default unless explicitly enabled
if settings.ENVIRONMENT == "development":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Include Routers
app.include_router(auth.router)
app.include_router(sync.router)
app.include_router(ai.router)
app.include_router(businesses.router)
app.include_router(business_sync.router)
app.include_router(business_chat.router)
app.include_router(meetings.router)

# Mount SQLAdmin UI (Prisma Studio equivalent)
setup_admin(app, engine)

@app.get("/v1/me", response_model=auth.UserProfileResponse, tags=["auth"])
async def get_me_top_level(
    auth_data: tuple[auth.Account, auth.AuthSession] = Depends(auth.get_current_user_and_session),
    db: AsyncSession = Depends(get_db),
):
    account, _ = auth_data
    cap_res = await resolve_account_capabilities(account, db)
    return auth.UserProfileResponse(
        id=str(account.id),
        email=account.email,
        role=account.role,
        system_role=cap_res.system_role,
        subscription_plan=cap_res.subscription_plan,
        effective_subscription_plan=cap_res.effective_subscription_plan,
        business_session=cap_res.business_session,
        is_active=account.is_active,
        created_at=account.created_at.isoformat(),
    )

@app.get("/healthz", status_code=status.HTTP_200_OK)
async def healthz():
    return {"status": "ok", "environment": settings.ENVIRONMENT, "version": "1.0.0"}
