from __future__ import annotations

from typing import List, Set

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse

from app.config import templates
from app.models.schemas import EVRecord
from app.services.repository import get_catalog

router = APIRouter()

# helpers: per-session saved keys (permanentId as strings)
def _get_saved_list(request: Request) -> List[str]:
    """
    Return the saved list from the session (kept as a list to preserve order).
    Ensures the value is well-formed.
    """
    val = request.session.get("saved_keys", [])
    if not isinstance(val, list):
        val = []
    return [s for s in (str(x).strip() for x in val) if s]

def _set_saved_list(request: Request, items: List[str]) -> None:
    request.session["saved_keys"] = items

def _saved_to_set(items: List[str]) -> Set[str]:
    return {s for s in items if s}

def _filter_catalog_by_saved(catalog: List[EVRecord], saved_ids: Set[str]) -> List[EVRecord]:
    """
    Return EVs whose ev.permanentId is in saved_ids.
    """
    out = []
    for ev in catalog:
        pid = getattr(ev, "permanentId", None)
        if pid is None:
            continue
        if str(pid) in saved_ids:
            out.append(ev)
    return out


# -----
# JSON API
# -----

@router.get("/api/saved")
async def api_get_saved(request: Request):
    saved = _get_saved_list(request)
    return {"keys": saved, "count": len(saved)}

@router.post("/api/saved/{permanent_id}")
async def api_add_saved(permanent_id: str, request: Request):
    key = permanent_id.strip()
    if not key.isdigit():
        raise HTTPException(status_code=400, detail="permanent_id must be digits")
    saved = _get_saved_list(request)
    if key not in saved:
        saved.append(key)  # preserve insertion order
        _set_saved_list(request, saved)
    return {"ok": True, "count": len(saved)}

@router.delete("/api/saved/{permanent_id}")
async def api_remove_saved(permanent_id: str, request: Request):
    key = permanent_id.strip()
    saved = _get_saved_list(request)
    if key in saved:
        saved.remove(key)
        _set_saved_list(request, saved)
    return {"ok": True, "count": len(saved)}

@router.delete("/api/saved")
async def api_clear_saved(request: Request):
    _set_saved_list(request, [])
    return {"ok": True, "count": 0}


# -----
# Pages
# -----

@router.get("/saved", response_class=HTMLResponse)
async def saved_page(request: Request):
    saved_list = _get_saved_list(request)
    saved_ids = _saved_to_set(saved_list)

    catalog = get_catalog()
    records = _filter_catalog_by_saved(catalog, saved_ids)

    trimmed = False
    MAX = 100
    if len(records) > MAX:
        records = records[:MAX]
        trimmed = True

    return templates.TemplateResponse(
        "saved/page.html",
        {
            "request": request,
            "records": records,
            "trimmed": trimmed,
            "unmatched": [],
            "saved_count": len(saved_list),
        },
    )

@router.get("/saved/fragment", response_class=HTMLResponse)
async def saved_fragment(request: Request):
    saved_list = _get_saved_list(request)
    saved_ids = _saved_to_set(saved_list)
    catalog = get_catalog()
    records = _filter_catalog_by_saved(catalog, saved_ids)

    return templates.TemplateResponse(
        "saved/fragment.html",
        {
            "request": request,
            "records": records,
        },
    )
