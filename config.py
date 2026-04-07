from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Air Quality Monitoring API"
    debug: bool = False

    openaq_base_url: str = "https://api.openaq.org/v3"
    openaq_timeout: float = 15.0
    openaq_api_key: str = ""          # Optional — set in .env for higher rate limits

    cache_ttl: int = 900              # 15 minutes
    cities_fetch_limit: int = 200
    rate_limit: str = "60/minute"     # slowapi format: "N/period"


settings = Settings()