from __future__ import annotations
import logging
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from app.config import templates
from app.services.repository import load_catalog

router = APIRouter()
log = logging.getLogger("routes.home")

# Helpers
PLACEHOLDER = "/static/images/placeholder_car.png"

def _to_dict(e):
    """Return a plain dict regardless of EVRecord / dict / SimpleNamespace."""
    if hasattr(e, "model_dump"):
        return e.model_dump()
    if isinstance(e, dict):
        return e
    fields = (
        "brand","model","year","price_cad","range_km","seats",
        "fastChargingSpeed","driveType","atvType","VClass","tags",
        "image_url","build_link","clearance","taxCreditAmount","score"
    )
    out = {}
    for f in fields:
        if hasattr(e, f):
            out[f] = getattr(e, f)
    return out

    

@router.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse(request, "home.html", {})

@router.get("/browse", response_class=HTMLResponse)
async def browse_all(request: Request):
    # load catalog (EVRecord list) and convert to dicts for the template
    catalog = await load_catalog()
    items = [_to_dict(e) for e in catalog]

    # ensure required defaults are present
    for d in items:
        d.setdefault("score", 0.0)
        d.setdefault("tags", [])
        d.setdefault("image_url", PLACEHOLDER)

    # simple alphabetical browse
    items.sort(key=lambda d: (d.get("brand",""), d.get("model","")))

    # reuse the results grid template (no filters/pagination on this page)
    return templates.TemplateResponse(request, "index.html", {
        "ev_data": items,
        "makes": sorted({d.get("brand","") for d in items if d.get("brand")}),
        "keywords": [],
        "max_price": None,
        "min_range": None,
        "seats_chip": None,
        "seats_num": None,
        "is_suv": False,
        "sort": "score_desc",
        "page": 1, "total_pages": 1, "has_next": False, "has_prev": False,
        "base_qs": "",
    })
