from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env", override=False)

DATABASE_PATH = Path(os.getenv("DATABASE_PATH", ROOT / "backend" / "runtime" / "app.sqlite3"))
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
AI_MODE = os.getenv("AI_MODE", "auto").strip().lower()
if AI_MODE not in {"auto", "fallback"}:
    raise ValueError("AI_MODE must be 'auto' or 'fallback'")
CORS_ORIGINS = [item.strip() for item in os.getenv(
    "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173"
).split(",") if item.strip()]
