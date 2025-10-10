from __future__ import annotations
import logging, os
from typing import List, Set
from urllib.parse import unquote

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates



from app.models.schemas import SearchParams, EVRecord
from app.services.repository import load_catalog, get_catalog_version
from app.services.search_service import (
    parse_query, filter_records, rank_records, sort_records, paginate, RESULT_CACHE
)
from app.rate_limit import allow as rate_allow
from app.config import templates, settings
from app.obsv import Timing, json_safe

logger = logging.getLogger("routes.search")
router = APIRouter()

DEBUG = os.getenv("DEBUG", "").lower() == "true"
SEM_POLICY = os.getenv("SEMANTIC_SEARCH", "auto").lower()  # 'auto' | 'off'

def _normalize_key(s: str | None) -> str | None:
    if not s or not isinstance(s, str):
        return None
    t = s.lower().strip()
    t = t.replace(" - ", "|").replace(" | ", "|")
    t = "|".join(part.strip() for part in t.split("|"))
    if "|" not in t:
        parts = t.split()
        if len(parts) > 1:
            t = parts[0] + "|" + " ".join(parts[1:])
    return t

def _fav_key_for_record(e: EVRecord) -> str | None:
    model_name = (e.model or "").split("(")[0].strip().lower()
    brand = (e.brand or "").strip().lower()
    if brand and model_name:
        return f"{brand}|{model_name}"
    return None

def _saved_keys_from_cookie(request: Request) -> Set[str]:
    raw = request.cookies.get("evision_favs", "")
    if not raw:
        return set()
    try:
        decoded = unquote(raw)
    except Exception:
        decoded = raw
    keys = set()
    for chunk in decoded.split(","):
        nk = _normalize_key(chunk)
        if nk:
            keys.add(nk)
    return keys

@router.api_route("/search", methods=["GET", "POST"], response_class=HTMLResponse)
async def search_ev(request: Request):
    if not DEBUG:
        ip = request.client.host if request.client else "unknown"
        if not rate_allow(ip):
            raise HTTPException(status_code=429, detail="Too many requests. Try again in a minute.")

    params_dict = dict(request.query_params)
    if request.method.upper() == "POST":
        form = await request.form()
        params_dict.update(form)

    try:
        params = SearchParams.model_validate(params_dict)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail=("parameters: Some inputs were not valid. "
                    "Examples: max_price=45000, min_range=300, seats=5, drivetrain=awd4.")
        )

    with Timing() as t_all:
        pq = parse_query(params.search_query)
        catalog: List[EVRecord] = await load_catalog(refresh=False)
        filtered = filter_records(
            catalog,
            pq,
            explicit_is_suv=params.is_suv,
            explicit_max_price=params.max_price,
            explicit_min_range=params.min_range,
            explicit_seats=params.seats,
            explicit_drivetrain=params.drivetrain,
        )

        use_sem = (SEM_POLICY != "off") and bool(pq.residual_text or pq.tokens)
        rank_records(filtered, pq, use_semantic=use_sem)
        sort_records(filtered, params.sort)

        page = max(1, params.page or 1)
        page_size = 24
        show_saved_only = bool(params.saved) or params_dict.get("savedonly") in ("1", "true", "True")
        cat_ver = get_catalog_version()
        cache_key = (
            cat_ver,
            params.search_query.strip().lower(),
            params.is_suv,
            params.max_price,
            params.min_range,
            params.seats,
            params.drivetrain,
            params.sort,
            show_saved_only,
            page,
        )
        if cache_key in RESULT_CACHE:
            page_items, page_meta = RESULT_CACHE[cache_key]
        else:
            page_items, page_meta = paginate(filtered, page=page, page_size=page_size)
            RESULT_CACHE[cache_key] = (page_items, page_meta)

    results = [r.model_dump() for r in page_items]
    seats_chip = f"{pq.seats} seats" if pq.seats is not None else None
    seats_num = pq.seats if pq.seats is not None else None

    return templates.TemplateResponse(request, "index.html", {
        "ev_data": results,
        "makes": sorted({r["brand"] for r in results}),
        "keywords": pq.tokens,
        "max_price": params.max_price,
        "min_range": params.min_range,
        "seats_chip": seats_chip,
        "seats_num": seats_num,
        "is_suv": bool(params.is_suv or pq.is_suv),
        "drivetrain": params.drivetrain,
        "sort": params.sort,
        "page": page_meta["page"],
        "page_size": page_meta["page_size"],
        "total_results": page_meta["total_results"],
        "total_pages": page_meta["total_pages"],
        "has_next": page_meta["has_next"],
        "has_prev": page_meta["has_prev"],
    })

@router.get("/debug/search")
async def debug_search(request: Request):
    if not DEBUG:
        raise HTTPException(status_code=404, detail="Not found")
    params_dict = dict(request.query_params)
    params = SearchParams.model_validate(params_dict)
    pq = parse_query(params.search_query)
    catalog = await load_catalog(refresh=False)
    filtered = filter_records(
        catalog,
        pq,
        explicit_is_suv=params.is_suv,
        explicit_max_price=params.max_price,
        explicit_min_range=params.min_range,
        explicit_seats=params.seats,
        explicit_drivetrain=params.drivetrain,
    )
    use_sem = (SEM_POLICY != "off") and bool(pq.residual_text or pq.tokens)
    rank_records(filtered, pq, use_semantic=use_sem)
    sort_records(filtered, params.sort)
    page_items, page_meta = paginate(filtered, page=max(1, params.page or 1), page_size=24)
    payload = {
        "params": params.model_dump(),
        "parsed_query": pq.__dict__,
        "page": page_meta,
        "items": [
            {
                "brand": e.brand,
                "model": e.model,
                "year": e.year,
                "price_cad": e.price_cad,
                "range_km": e.range_km,
                "seats": e.seats,
                "fastChargingSpeed": e.fastChargingSpeed,
                "driveType": e.driveType,
                "score": float(e.score),
            } for e in page_items
        ]
    }
    return JSONResponse(payload)
