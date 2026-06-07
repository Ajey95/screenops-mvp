from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "ScreenOps"
    demo_recipient_email: str = "vabjashwanthreddy@gmail.com"
    commitment_sheet_id: str = "1H-XdYFIjET8Cc88wg2Ir9tIOGuzfUTOplvvesqJMDuI"
    google_client_secret_file: str = "docs/client_secret_358547275814-9vd3hqba2r0i498o4n0cvmkgdn2f7qbg.apps.googleusercontent.com.json"
    google_token_file: str = ".screenops/google-token.json"
    google_token_cache_file: str = ".screenops/google-token-runtime.json"
    google_mcp_executable: str = "tools/google-mcp-server.exe"
    google_mcp_config_file: str = ".screenops/google-mcp-config.json"
    audit_db_file: str = ".screenops/audit.sqlite3"
    cors_origin: str = "http://localhost:5173"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    calendar_timezone: str = "Asia/Kolkata"
    calendar_reminder_hour: int = 9

    @property
    def allowed_origins(self) -> list[str]:
        origins = [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
        if self.cors_origin and self.cors_origin not in origins:
            origins.append(self.cors_origin)
        return origins

    @property
    def root_dir(self) -> Path:
        return Path(__file__).resolve().parents[2]

    def resolve(self, value: str) -> Path:
        path = Path(value)
        if path.is_absolute():
            return path
        return self.root_dir / path


@lru_cache
def get_settings() -> Settings:
    return Settings()
