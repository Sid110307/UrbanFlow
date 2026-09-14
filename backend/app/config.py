from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    gemini_api_key: str = ""
    gemini_flash_model: str = "gemini-2.5-flash"
    gemini_pro_model: str = "gemini-2.5-pro"

    sim_interval_seconds: float = 6.0
    blockage_trigger_threshold: float = 70.0

    database_url: str = f"sqlite:///{BASE_DIR / 'drainguard.db'}"
    debris_images_dir: Path = BASE_DIR / "assets" / "debris_images"


settings = Settings()
