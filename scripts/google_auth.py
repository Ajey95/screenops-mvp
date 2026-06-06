from pathlib import Path
import sys

from google_auth_oauthlib.flow import InstalledAppFlow

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.config import get_settings  # noqa: E402
from app.google_api_adapters import SCOPES  # noqa: E402


def main() -> None:
    settings = get_settings()
    secret_file = settings.resolve(settings.google_client_secret_file)
    token_file = settings.resolve(settings.google_token_file)
    token_file.parent.mkdir(parents=True, exist_ok=True)

    flow = InstalledAppFlow.from_client_secrets_file(str(secret_file), SCOPES)
    credentials = flow.run_local_server(port=0)
    token_file.write_text(credentials.to_json(), encoding="utf-8")
    print(f"Google OAuth token saved to {token_file}")


if __name__ == "__main__":
    main()
