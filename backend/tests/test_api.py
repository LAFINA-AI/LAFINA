import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_healthz(async_client: AsyncClient):
    res = await async_client.get("/healthz")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"

@pytest.mark.asyncio
async def test_register_and_login(async_client: AsyncClient):
    # Reject short password (< 15 chars)
    short_res = await async_client.post("/v1/auth/register", json={
        "email": "student@ustp.edu.ph",
        "password": "short"
    })
    assert short_res.status_code == 422 or short_res.status_code == 400

    # Reject common password
    common_res = await async_client.post("/v1/auth/register", json={
        "email": "student@ustp.edu.ph",
        "password": "password123"
    })
    assert common_res.status_code in (400, 422)

    # Valid registration (15+ chars, non-common)
    reg_res = await async_client.post("/v1/auth/register", json={
        "email": "student@ustp.edu.ph",
        "password": "super-strong-lafina-passphrase-2026"
    })
    assert reg_res.status_code == 201
    reg_data = reg_res.json()
    assert "access_token" in reg_data
    assert "refresh_token" in reg_data
    assert len(reg_data["recovery_codes"]) == 4

    # Login
    login_res = await async_client.post("/v1/auth/login", json={
        "email": "student@ustp.edu.ph",
        "password": "super-strong-lafina-passphrase-2026",
        "device_info": "Pixel 7 Android 14"
    })
    assert login_res.status_code == 200
    login_data = login_res.json()
    refresh_token = login_data["refresh_token"]

    # Refresh Token Rotation
    ref_res = await async_client.post("/v1/auth/refresh", json={
        "refresh_token": refresh_token
    })
    assert ref_res.status_code == 200
    new_token_data = ref_res.json()
    assert new_token_data["refresh_token"] != refresh_token

    # Old refresh token is revoked
    old_ref_res = await async_client.post("/v1/auth/refresh", json={
        "refresh_token": refresh_token
    })
    assert old_ref_res.status_code == 401

    # Check /me profile with rotated token
    new_access_token = new_token_data["access_token"]
    headers = {"Authorization": f"Bearer {new_access_token}"}
    me_res = await async_client.get("/v1/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "student@ustp.edu.ph"
    assert me_res.json()["role"] == "student"

@pytest.mark.asyncio
async def test_sync_batch_and_tampering_defense(async_client: AsyncClient):
    # Register & get token
    reg_res = await async_client.post("/v1/auth/register", json={
        "email": "sync_user@ustp.edu.ph",
        "password": "super-strong-lafina-passphrase-2026"
    })
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Attempt tampering: injection of owner_id or role in payload should be rejected or stripped
    tamper_mutation = {
        "mutationId": "mut-tamper-001",
        "entityType": "task",
        "entityId": "task-001",
        "operation": "create",
        "clientUpdatedAt": "2026-07-22T10:00:00Z",
        "payload": {
            "title": "Hack Exam",
            "owner_id": "00000000-0000-0000-0000-000000000000",
            "role": "admin"
        }
    }
    sync_res = await async_client.post("/v1/sync/batch", headers=headers, json={
        "mutations": [tamper_mutation],
        "cursor": 0
    })
    assert sync_res.status_code == 200
    sync_data = sync_res.json()
    assert len(sync_data["rejected"]) == 1
    assert "Forbidden" in sync_data["rejected"][0]["reason"]

    # Valid mutation
    valid_mutation = {
        "mutationId": "mut-valid-001",
        "entityType": "task",
        "entityId": "task-001",
        "operation": "create",
        "clientUpdatedAt": "2026-07-22T10:00:00Z",
        "payload": {
            "title": "Study Mobile AI Architecture",
            "due_date": "2026-07-25",
            "due_time": "14:00",
            "is_completed": False,
            "priority": "high",
            "category": "Academics"
        }
    }
    sync_valid_res = await async_client.post("/v1/sync/batch", headers=headers, json={
        "mutations": [valid_mutation],
        "cursor": 0
    })
    assert sync_valid_res.status_code == 200
    res_data = sync_valid_res.json()
    assert len(res_data["accepted"]) == 1
    assert res_data["accepted"][0]["status"] == "accepted"
    assert len(res_data["changes"]) == 1
    assert res_data["changes"][0]["entityId"] == "task-001"

@pytest.mark.asyncio
async def test_online_ai_proxy(async_client: AsyncClient):
    from backend.tests.conftest import TestingSessionLocal
    from backend.app.models.account import Account
    from sqlalchemy import select

    password = "super-strong-lafina-passphrase-2026"
    reg_res = await async_client.post("/v1/auth/register", json={
        "email": "ai_user@ustp.edu.ph",
        "password": password
    })
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Student role attempt should be rejected with 403 Forbidden
    student_chat_res = await async_client.post("/v1/ai/chat", headers=headers, json={
        "requestId": "req-001",
        "messages": [
            {"role": "user", "content": "How do I organize my study schedule for midterms?"}
        ]
    })
    assert student_chat_res.status_code == 403
    assert "student_pro" in student_chat_res.json()["detail"]

    # 2. Promote account role to student_pro in DB and log in to get updated JWT claim
    async with TestingSessionLocal() as db:
        stmt = select(Account).where(Account.email == "ai_user@ustp.edu.ph")
        acc = (await db.execute(stmt)).scalar_one()
        acc.role = "student_pro"
        await db.commit()

    login_res = await async_client.post("/v1/auth/login", json={
        "email": "ai_user@ustp.edu.ph",
        "password": password
    })
    pro_token = login_res.json()["access_token"]
    pro_headers = {"Authorization": f"Bearer {pro_token}"}

    # 3. student_pro request should succeed with 200 OK
    pro_chat_res = await async_client.post("/v1/ai/chat", headers=pro_headers, json={
        "requestId": "req-002",
        "messages": [
            {"role": "user", "content": "How do I organize my study schedule for midterms?"}
        ]
    })
    assert pro_chat_res.status_code == 200
    chat_data = pro_chat_res.json()
    assert chat_data["requestId"] == "req-002"
    assert "[Online Assistant" in chat_data["reply"]
