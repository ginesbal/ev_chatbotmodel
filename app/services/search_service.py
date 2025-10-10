from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import List, Optional, Dict, Any, Tuple

import numpy as np
from cachetools import TTLCache

from app.models.schemas import EVRecord, SortKey
from app.services.nlp import get_doc_embeddings, encode_query

logger = logging.getLogger("search_service")

RESULT_CACHE: TTLCache = TTLCache(maxsize=1024, ttl=20 * 60)

SUV_TOKENS = ("suv", "crossover", "cuv")


# -----
# Query parsing
# -----

@dataclass
class ParsedQuery:
    residual_text: str
    tokens: List[str]
    is_suv: Optional[bool]
    max_price: Optional[float]    # CAD (from "under $X")
    min_price: Optional[float]    # CAD (from "over $X")
    min_range: Optional[int]      # km  (default operator ≥)
    seats: Optional[int]          # ≥ seats
    min_fast_kw: Optional[float]  # ≥ kW from free text
    drive_any_4: bool             # true if "awd/4wd/4x4" appears (broad)
    drive_filter: Optional[str]   # "AWD"|"4WD"|"FWD"|"RWD" when explicitly requested

# NOTE: parse RANGE before PRICE to avoid eating "over 200 mi" with price regex.

# symbol-operator range like ">= 300 km", "> 200 mi"
RANGE_SYM_RE  = re.compile(r"\b(>=|>|<=|<)\s*(\d+(?:\.\d+)?)\s*(km|mi)\b", re.I)
# word-operator range like "over 200 mi", "under 300 km"
RANGE_WORD_RE = re.compile(r"\b(over|under)\s*(\d+(?:\.\d+)?)\s*(km|mi)\b", re.I)

# price like "under 45k", "over $60,000"
# (kept permissive but applied AFTER range parsing)
PRICE_RE = re.compile(r"\b(under|over)\s*\$?\s*([\d,]+(?:\.\d+)?k|\d{2,}(?:\.\d+)?)\b", re.I)

# seats like "7 seats"
SEATS_RE = re.compile(r"\b(\d+)\s*seats?\b", re.I)
# fast charge like "150 kW" or ">150 kW"
KW_RE    = re.compile(r"\b(>=|>)?\s*(\d+)\s*kW\b", re.I)
# suv words
SUV_RE   = re.compile(r"\b(suv|crossover|cuv)\b", re.I)

# drivetrain
DRIVE_ANY_RE   = re.compile(r"\b(awd|4x4|4wd)\b", re.I)      # broad intent
DRIVE_EXACT_RE = re.compile(r"\b(awd|4wd|fwd|rwd)\b", re.I)  # exact filter

STOP = {"a", "an", "the", "and", "or", "with", "type", "for", "of", "by", "range"}


def _norm_tokens(s: str) -> List[str]:
    return [w for w in re.split(r"\W+", s.lower()) if w and w not in STOP]


def _to_number_k(s: str) -> float:
    s = s.replace(",", "").lower()
    return float(s[:-1]) * 1000 if s.endswith("k") else float(s)


def _mi_to_km(x: float) -> int:
    return int(round(float(x) * 1.60934))


def parse_query(q: str) -> ParsedQuery:
    """Parse natural-language hints out of the free-text query."""
    original = (q or "")
    s = original.strip()

    # Drivetrain FIRST (from original string, before mutate s)
    drive_filter: Optional[str] = None
    m_drive_exact = DRIVE_EXACT_RE.search(original)
    if m_drive_exact:
        df = m_drive_exact.group(1).lower()
        drive_filter = {"awd": "AWD", "4wd": "4WD", "fwd": "FWD", "rwd": "RWD"}[df]
    drive_any_4 = bool(DRIVE_ANY_RE.search(original))  # broad AWD/4WD intent

    # Range (word & symbol) BEFORE price
    min_range = None
    # Word operators: "over 200 mi", "under 300 km"
    for m in RANGE_WORD_RE.finditer(s):
        word = m.group(1).lower()
        qty = float(m.group(2))
        unit = m.group(3).lower()
        km = qty if unit == "km" else _mi_to_km(qty)
        if word == "over":
            min_range = int(km)
    s = RANGE_WORD_RE.sub("", s)

    # Symbol operators: ">= 300 km", "> 200 mi"
    for m in RANGE_SYM_RE.finditer(s):
        op = m.group(1)
        qty = float(m.group(2))
        unit = m.group(3).lower()
        km = qty if unit == "km" else _mi_to_km(qty)
        if op in (">", ">="):
            min_range = int(km)
    s = RANGE_SYM_RE.sub("", s)

    # Price AFTER range so "over 200 mi" isn't misread as price
    max_price = min_price = None
    for m in PRICE_RE.finditer(s):
        kind, num = m.group(1).lower(), m.group(2)
        val = _to_number_k(num)
        if kind == "under":
            max_price = val
        else:
            min_price = val
    s = PRICE_RE.sub("", s)

    # Seats
    seats = None
    m = SEATS_RE.search(s)
    if m:
        seats = int(m.group(1))
    s = SEATS_RE.sub("", s)

    # Fast charge
    min_fast_kw = None
    m = KW_RE.search(s)
    if m:
        try:
            min_fast_kw = float(m.group(2))
        except Exception:
            min_fast_kw = None
    s = KW_RE.sub("", s)

    # SUV
    is_suv = bool(SUV_RE.search(s))
    s = SUV_RE.sub("", s)

    # remove any drivetrain tokens from residual text for cleaner tokens
    s = DRIVE_ANY_RE.sub("", s)
    s = DRIVE_EXACT_RE.sub("", s)

    residual_text = re.sub(r"\s+", " ", s).strip()
    tokens = _norm_tokens(residual_text)

    return ParsedQuery(
        residual_text=residual_text,
        tokens=tokens,
        is_suv=is_suv if is_suv else None,
        max_price=max_price,
        min_price=min_price,
        min_range=min_range,
        seats=seats,
        min_fast_kw=min_fast_kw,
        drive_any_4=drive_any_4,
        drive_filter=drive_filter,
    )


# -----
# Filtering
# -----

def _is_suv(vclass: Optional[str], tags: List[str]) -> bool:
    """Accept 'suv', 'crossover', or 'cuv' in either VClass or tags."""
    for src in ((vclass or ""), *(tags or [])):
        s = str(src).lower()
        if any(tok in s for tok in SUV_TOKENS):
            return True
    return False


def filter_records(
    records: List[EVRecord],
    pq: ParsedQuery,
    *,
    explicit_is_suv: Optional[bool] = None,
    explicit_max_price: Optional[float] = None,
    explicit_min_range: Optional[int] = None,
    explicit_seats: Optional[int] = None,
    explicit_drivetrain: str = "any",
) -> List[EVRecord]:
    """
    Apply effective constraints. Explicit GET filters override parsed NL hints.
    """
    want_suv    = explicit_is_suv if explicit_is_suv is not None else pq.is_suv
    max_price   = explicit_max_price if explicit_max_price is not None else pq.max_price
    min_range   = explicit_min_range if explicit_min_range is not None else pq.min_range
    seats       = explicit_seats if explicit_seats is not None else pq.seats
    min_price   = pq.min_price 
    min_fast_kw = pq.min_fast_kw

    # Drivetrain precedence:
    # 1. explicit UI filter if present
    # 2. else parsed exact drive_filter (AWD/4WD/FWD/RWD)
    # 3. else broad drive_any_4 → {"AWD","4WD"}
    allow_drives: Optional[set[str]] = None
    if explicit_drivetrain and explicit_drivetrain != "any":
        key = explicit_drivetrain.lower()
        if key == "awd4":
            allow_drives = {"AWD", "4WD"}
        elif key in {"awd", "4wd", "fwd", "rwd"}:
            allow_drives = {key.upper()}
    elif pq.drive_filter:
        allow_drives = {pq.drive_filter}
    elif pq.drive_any_4:
        allow_drives = {"AWD", "4WD"}

    out: List[EVRecord] = []
    for e in records:
        if want_suv and not _is_suv(e.VClass, e.tags):
            continue
        if min_price is not None and (e.price_cad is None or e.price_cad < min_price):
            continue
        if max_price is not None and (e.price_cad is None or e.price_cad > max_price):
            continue
        if min_range is not None and (e.range_km is None or e.range_km < min_range):
            continue
        if seats is not None and (e.seats or 0) < seats:
            continue
        if min_fast_kw is not None and (e.fastChargingSpeed or 0.0) < min_fast_kw:
            continue
        if allow_drives and (e.driveType or "").upper() not in allow_drives:
            continue
        out.append(e)
    return out


# -----
# Ranking (token + semantic + spec fit + tie-break)
# -----

def _token_text_score(tokens: List[str], text: str) -> float:
    if not tokens:
        return 0.0
    words = set(_norm_tokens(text))
    if not words:
        return 0.0
    hits = sum(1 for t in tokens if t in words)
    return hits / max(1, len(tokens))


def rank_records(records: List[EVRecord], pq: ParsedQuery, use_semantic: bool) -> None:
    """
    Mutates `records`: sets e.score ∈ [0..100], higher is better.
    Combines: token match, semantic sim (if available), spec fit, and a tie-break.
    """
    # token overlap
    docs = [
        f"{r.brand} {r.model} {r.VClass or ''} {r.driveType or ''} {' '.join(r.tags)}".lower()
        for r in records
    ]
    text_scores = [_token_text_score(pq.tokens, d) for d in docs]

    # semantic similarity aligned via doc_index (precomputed on full catalog)
    sem_scores = [0.0] * len(records)
    if use_semantic and (pq.residual_text or pq.tokens):
        emb_mat, _ = get_doc_embeddings()
        qv = encode_query(pq.residual_text or " ".join(pq.tokens))
        if emb_mat is not None and qv is not None:
            try:
                rows = [e.doc_index for e in records if e.doc_index is not None]
                if len(rows) == len(records):
                    sub = emb_mat[rows, :]
                    sims = np.dot(sub, qv)  # cos
                    sem_scores = [(s + 1.0) / 2.0 for s in sims]
            except Exception as ex:
                logger.debug("Semantic subset failed; tokens only. %s", ex)

    # spec-fit subscore (encourages matching numeric constraints)
    spec_scores: List[float] = []
    for e in records:
        parts: List[float] = []
        if pq.max_price is not None and e.price_cad:
            parts.append(min(1.0, pq.max_price / max(e.price_cad, 1.0)))
        if pq.min_price is not None and e.price_cad:
            parts.append(min(1.0, (e.price_cad - pq.min_price) / max(pq.min_price, 1.0)))
        if pq.min_range is not None and e.range_km:
            parts.append(min(1.0, e.range_km / max(pq.min_range, 1.0)))
        if pq.seats is not None and e.seats:
            parts.append(min(1.0, e.seats / max(pq.seats, 1.0)))
        if pq.min_fast_kw is not None and e.fastChargingSpeed:
            parts.append(min(1.0, e.fastChargingSpeed / max(pq.min_fast_kw, 1.0)))
        spec_scores.append(sum(parts) / len(parts) if parts else 0.0)

    # tie-break: favor more range + lower price; add small modernity/fast-charge boosts
    rng_vals = [int(e.range_km) for e in records if (e.range_km or 0) > 0]
    price_vals = [float(e.price_cad) for e in records if (e.price_cad or 0) > 0]
    rmin, rmax = (min(rng_vals), max(rng_vals)) if rng_vals else (0, 1)
    pmin, pmax = (min(price_vals), max(price_vals)) if price_vals else (1.0, 1.0)

    tie_scores: List[float] = []
    for e in records:
        r = e.range_km or 0
        p = float(e.price_cad) if e.price_cad else None
        rnorm = (r - rmin) / max(1, (rmax - rmin))
        pinv  = 0.0 if (p is None or pmax == pmin) else (pmax - p) / max(1e-9, (pmax - pmin))
        tie = max(0.0, min(1.0, 0.6 * rnorm + 0.4 * pinv))
        if (e.fastChargingSpeed or 0) >= 150:
            tie += 0.03
        if (e.year or 0) >= 2023:
            tie += 0.03
        tie_scores.append(min(1.0, tie))

    # blend into a final 0..100 score (force builtin float)
    for i, e in enumerate(records):
        text = 0.7 * text_scores[i] + 0.3 * sem_scores[i] if (pq.tokens or pq.residual_text) else 0.0
        score01 = 0.50 * text + 0.30 * spec_scores[i] + 0.20 * tie_scores[i]
        e.score = float(round(max(0.0, min(1.0, score01)) * 100.0, 1))


# -----
# Sorting
# -----

def sort_records(records: List[EVRecord], sort: SortKey) -> None:
    """Stable, None-safe sorts for all supported sort keys."""

    def price_per_km(e: EVRecord) -> Optional[float]:
        if (e.price_cad or 0) > 0 and (e.range_km or 0) > 0:
            return float(e.price_cad) / float(e.range_km)
        return None

    if sort == "price_asc":
        records.sort(key=lambda e: (
            e.price_cad if e.price_cad is not None else float("inf"),
            -e.score, e.brand or "", e.model or ""
        ))
    elif sort == "price_desc":
        records.sort(key=lambda e: (
            -(e.price_cad or -1),
            -e.score, e.brand or "", e.model or ""
        ))
    elif sort == "range_asc":
        records.sort(key=lambda e: (
            (e.range_km if e.range_km is not None else 1_000_000_000),
            -e.score, e.brand or "", e.model or ""
        ))
    elif sort == "range_desc":
        records.sort(key=lambda e: (
            -(e.range_km or -1),
            -e.score, e.brand or "", e.model or ""
        ))
    elif sort == "year_desc":
        records.sort(key=lambda e: (
            -(e.year or -1),
            -e.score, e.brand or "", e.model or ""
        ))
    elif sort == "year_asc":
        records.sort(key=lambda e: (
            (e.year if e.year is not None else 1_000_000_000),
            -e.score, e.brand or "", e.model or ""
        ))
    elif sort == "fast_desc":
        records.sort(key=lambda e: (
            -(e.fastChargingSpeed or -1),
            -e.score, e.brand or "", e.model or ""
        ))
    elif sort == "fast_asc":
        records.sort(key=lambda e: (
            (e.fastChargingSpeed if e.fastChargingSpeed is not None else 1_000_000_000),
            -e.score, e.brand or "", e.model or ""
        ))
    elif sort == "price_per_km_asc":
        records.sort(key=lambda e: (
            (price_per_km(e) if price_per_km(e) is not None else float("inf")),
            -e.score, e.brand or "", e.model or ""
        ))
    elif sort == "price_per_km_desc":
        records.sort(key=lambda e: (
            -(price_per_km(e) or -1),
            -e.score, e.brand or "", e.model or ""
        ))
    else:
        records.sort(key=lambda e: (
            -(e.score or 0),
            -(e.range_km or 0),
            (e.price_cad or 1e12),
            e.brand or "", e.model or ""
        ))


# -----
# Pagination
# -----

def paginate(records: List[EVRecord], page: int, page_size: int) -> Tuple[List[EVRecord], Dict[str, Any]]:
    """Return the current page slice and a tiny metadata dict."""
    total = len(records)
    pages = max(1, (total + page_size - 1) // page_size)
    page = max(1, min(page, pages))
    start = (page - 1) * page_size
    end = start + page_size
    return records[start:end], {
        "page": page,
        "page_size": page_size,
        "total_results": total,
        "total_pages": pages,
        "has_prev": page > 1,
        "has_next": page < pages,
    }
