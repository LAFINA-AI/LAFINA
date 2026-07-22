import asyncio
import getpass
import sys
from sqlalchemy import select
from backend.app.database import AsyncSessionLocal, engine, Base
from backend.app.models.account import Account
from backend.app.security.auth import hash_password

async def create_admin(email: str, password: str):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        stmt = select(Account).where(Account.email == email.lower())
        res = await db.execute(stmt)
        existing = res.scalar_one_or_none()

        if existing:
            existing.role = "admin"
            existing.password_hash = hash_password(password)
            existing.is_active = True
            print(f"[Admin CLI] Updated existing account '{email}' to admin role with new password.")
        else:
            pwd_hash = hash_password(password)
            admin_acc = Account(
                email=email.lower(),
                password_hash=pwd_hash,
                role="admin",
                is_active=True
            )
            db.add(admin_acc)
            print(f"[Admin CLI] Created new admin account '{email}'.")
        await db.commit()

if __name__ == "__main__":
    if len(sys.argv) >= 3:
        email_input = sys.argv[1]
        password_input = sys.argv[2]
    elif len(sys.argv) == 2:
        email_input = sys.argv[1]
        password_input = getpass.getpass("Enter admin password (min 15 chars): ")
    else:
        email_input = input("Enter admin email: ")
        password_input = getpass.getpass("Enter admin password (min 15 chars): ")

    if len(password_input) < 15:
        print("[Error] Password must be at least 15 characters long.")
        sys.exit(1)

    asyncio.run(create_admin(email_input, password_input))
