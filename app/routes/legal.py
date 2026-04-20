from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from app.config import templates

router = APIRouter()


@router.get("/privacy", response_class=HTMLResponse)
async def privacy(request: Request):
    return templates.TemplateResponse(request, "privacy.html", {})


@router.get("/terms", response_class=HTMLResponse)
async def terms(request: Request):
    return templates.TemplateResponse(request, "terms.html", {})
