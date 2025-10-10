from __future__ import annotations

from pathlib import Path
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from fastapi.templating import Jinja2Templates

import os
def _default_project_root() -> Path:
    return Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    """
    Central configuration for paths and feature flags.

    Terms:
    - project_root: absolute path to the repository root on disk.
    - template_dir: directory containing Jinja2 templates (defaults to <root>/templates).
    - static_dir: directory served at /static (defaults to <root>/static).
    - log_file: default log file path (defaults to <root>/app.log).
    - debug: enable extra logs & disable rate limiting (from env DEBUG=true|false).
    - semantic_search: 'auto' (try to load MiniLM) or 'off' (tokens only).
    - rate_limit_per_min: per-IP rate limit when not in DEBUG.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # paths
    project_root: Path = Field(default_factory=_default_project_root)
    template_dir: Optional[str] = None
    static_dir: Optional[str] = None
    log_file: Optional[str] = None
    secret_key: str = os.getenv("EVISION_SECRET_KEY", "dev-change-this-please")

    # flags
    debug: bool = Field(default=False, alias="DEBUG")
    semantic_search: str = Field(default="auto", alias="SEMANTIC_SEARCH")  # 'auto' | 'off'
    rate_limit_per_min: int = Field(default=60, alias="RATE_LIMIT_PER_MIN")

    def __init__(self, **values):
        super().__init__(**values)
        root = self.project_root

        if not self.template_dir:
            object.__setattr__(self, "template_dir", str(root / "templates"))
        if not self.static_dir:
            object.__setattr__(self, "static_dir", str(root / "static"))
        if not self.log_file:
            object.__setattr__(self, "log_file", str(root / "app.log"))

settings = Settings()
templates = Jinja2Templates(directory=str(settings.template_dir))

__all__ = ["settings", "templates", "Settings"]
