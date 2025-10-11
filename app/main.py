from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app.config import Settings
from app.routes.home import router as home_router
from app.routes.search import router as search_router
from app.routes.saved import router as saved_router

settings = Settings()
app = FastAPI(title="EVison Advisor")

app.add_middleware(SessionMiddleware, secret_key=settings.secret_key)

# static
app.mount("/static", StaticFiles(directory=settings.static_dir), name="static")

# routers
app.include_router(home_router)
app.include_router(search_router)
app.include_router(saved_router)



