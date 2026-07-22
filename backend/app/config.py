from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
import functools

# Generate default RSA key pair for development/testing if not provided via env
def _generate_dev_rsa_pair():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    ).decode("utf-8")
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    ).decode("utf-8")
    return private_pem, public_pem

_dev_priv_pem, _dev_pub_pem = _generate_dev_rsa_pair()

class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/lafina"
    # Optional Admin Account Seeding from Environment Variables
    ADMIN_EMAIL: Optional[str] = None
    ADMIN_PASSWORD: Optional[str] = None

    # JWT RS256 Configuration
    JWT_PRIVATE_KEY: str = _dev_priv_pem
    JWT_PUBLIC_KEY: str = _dev_pub_pem
    JWT_ISSUER: str = "lafina-auth"
    JWT_AUDIENCE: str = "lafina-app"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Argon2id Configuration (NIST SP 800-63B & OWASP: >= 19MiB memory, 2 iterations, 1 parallelism)
    ARGON2_MEMORY_COST_KIB: int = 19456  # 19 MiB
    ARGON2_TIME_COST: int = 2
    ARGON2_PARALLELISM: int = 1

    # Security & Rate Limiting
    MAX_BODY_SIZE_BYTES: int = 1048576  # 1 MiB
    MAX_LOGIN_FAILURES_PER_15MIN: int = 10
    MAX_REGISTRATIONS_PER_IP_PER_HOUR: int = 100
    MAX_AI_REQUESTS_PER_MIN: int = 10
    MAX_AI_REQUESTS_PER_DAY: int = 100

    # DeepSeek API Configuration
    DEEPSEEK_API_KEY: str = "mock-deepseek-key-for-dev"
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com/v1"
    DEEPSEEK_MODEL: str = "deepseek-v4-flash"

    # Password blocklist (common passwords to reject)
    COMMON_PASSWORDS: set[str] = {
        "password", "password123", "1234567890", "12345678", "qwertyuiop",
        "administrator", "letmein123", "welcome123", "changeme123", "lafina12345"
    }

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

@functools.lru_cache()
def get_settings() -> Settings:
    return Settings()
