import logging
import os
from pathlib import Path
from typing import Any

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

# Load app/backend/.env when running locally (so OIDC_* etc. apply without exporting to shell)
_BACKEND_DIR = Path(__file__).resolve().parent.parent


def _default_sqlite_database_url() -> str:
    """Local dev default: SQLite file next to the backend package (works from any cwd)."""
    db_path = (Path(__file__).resolve().parent.parent / "local_dev.db").resolve()
    posix = db_path.as_posix()
    # SQLAlchemy SQLite absolute path: four slashes after the scheme (see SQLAlchemy SQLite docs).
    return "sqlite:////" + posix.lstrip("/")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        case_sensitive=False,
        extra="ignore",
        env_file=_BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
    )

    # Application
    app_name: str = "FastAPI Modular Template"
    debug: bool = False
    version: str = "1.0.0"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # Database (override with DATABASE_URL for Postgres, etc.)
    database_url: str = Field(default_factory=_default_sqlite_database_url)

    # OIDC (Auth0: set OIDC_ISSUER_URL to https://YOUR_TENANT.us.auth0.com — no trailing path)
    oidc_issuer_url: str = ""
    oidc_client_id: str = ""
    oidc_client_secret: str = ""
    oidc_scope: str = "openid profile email"

    # App session JWT (after Auth0 callback); use a long random string in production
    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440

    # Must match the SPA origin and Auth0 "Allowed Logout URLs" (…/logout-callback)
    frontend_url: str = "http://localhost:3000"

    # Optional first admin (Auth0 user id is the `sub` claim, e.g. auth0|xxxx or oauth2|...)
    admin_user_id: str = ""
    admin_user_email: str = ""

    # X API v2 (live scanning). Loaded from TWITTER_BEARER_TOKEN in .env (not only raw os.environ).
    twitter_bearer_token: str = ""

    # AI rewrite / aihub (OpenAI-compatible API). Loaded from .env — required for /api/v1/rewrite/generate.
    # OpenRouter: APP_AI_BASE_URL=https://openrouter.ai/api/v1 and APP_AI_KEY=sk-or-v1-...
    app_ai_base_url: str = ""
    app_ai_key: str = ""
    # Models on OpenRouter (provider/model). Default: DeepSeek Chat — low cost, strong for rewrites.
    # Override e.g. openrouter/free or openai/gpt-4o-mini — see openrouter.ai/models
    app_ai_rewrite_model: str = "deepseek/deepseek-chat"
    app_ai_extract_hook_model: str = "deepseek/deepseek-chat"

    # AWS Lambda Configuration
    is_lambda: bool = False
    lambda_function_name: str = "fastapi-backend"
    aws_region: str = "us-east-1"

    @property
    def backend_url(self) -> str:
        """Generate backend URL from host and port."""
        if self.is_lambda:
            # In Lambda environment, return the API Gateway URL
            return os.environ.get(
                "PYTHON_BACKEND_URL", f"https://{self.lambda_function_name}.execute-api.{self.aws_region}.amazonaws.com"
            )
        else:
            # Use localhost (not 127.0.0.1) so OIDC redirect_uri matches typical Auth0 allowlists.
            display_host = "localhost" if self.host == "0.0.0.0" else self.host
            return os.environ.get("PYTHON_BACKEND_URL", f"http://{display_host}:{self.port}")

    def __getattr__(self, name: str) -> Any:
        """
        Dynamically read attributes from environment variables.
        For example: settings.opapi_key reads from OPAPI_KEY environment variable.

        Args:
            name: Attribute name (e.g., 'opapi_key')

        Returns:
            Value from environment variable

        Raises:
            AttributeError: If attribute doesn't exist and not found in environment variables
        """
        # Convert attribute name to environment variable name (snake_case -> UPPER_CASE)
        env_var_name = name.upper()

        # Check if environment variable exists
        if env_var_name in os.environ:
            value = os.environ[env_var_name]
            # Cache the value in instance dict to avoid repeated lookups
            self.__dict__[name] = value
            logger.debug(f"Read dynamic attribute {name} from environment variable {env_var_name}")
            return value

        # If not found, raise AttributeError to maintain normal Python behavior
        raise AttributeError(f"'{self.__class__.__name__}' object has no attribute '{name}'")


# Global settings instance
settings = Settings()
