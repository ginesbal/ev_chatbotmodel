# api/index.py
from __future__ import annotations
import logging
import sys
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

# Make the repo root importable so `import app...` works both locally and on Vercel
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config import Settings

settings = Settings()
app = FastAPI(title="EVison Advisor")

app.add_middleware(SessionMiddleware, secret_key=settings.secret_key)

# Static dir (falls back to ./static if Settings.static_dir is unset)
static_path = Path(settings.static_dir or "static")
if static_path.exists() and static_path.is_dir():
    app.mount("/static", StaticFiles(directory=str(static_path)), name="static")
else:
    logging.warning("Static directory not found at %s; skipping mount.", static_path)

# Routers
try:
    from app.routes.home import router as home_router
    from app.routes.search import router as search_router
    from app.routes.saved import router as saved_router

    app.include_router(home_router)
    app.include_router(search_router)
    app.include_router(saved_router)
except Exception as e:
    logging.exception("Router import failed: %s", e)

@app.get("/health")
def health():
    return {"ok": True}

@app.get("/")
def root():
    return {"service": "EVison Advisor API", "status": "running"}

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logging.exception("Unhandled error: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})
