from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.sessions import SessionMiddleware

from app.config import Settings, templates
from app.routes.home import router as home_router
from app.routes.search import router as search_router
from app.routes.saved import router as saved_router
from app.routes.legal import router as legal_router

settings = Settings()
app = FastAPI(title="EVison Advisor")

app.add_middleware(SessionMiddleware, secret_key=settings.secret_key)

# static
app.mount("/static", StaticFiles(directory=settings.static_dir), name="static")

# routers
app.include_router(home_router)
app.include_router(search_router)
app.include_router(saved_router)
app.include_router(legal_router)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    if exc.status_code == 404:
        return templates.TemplateResponse(
            "404.html", {"request": request}, status_code=404
        )
    raise exc



