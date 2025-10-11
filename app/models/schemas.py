from __future__ import annotations
"""
Pydantic models for request/response and normalized EV records.

Key terms
---------
SortKey:
    Allowed sort options mirrored in the UI select:
        - "score_desc"            : best match (ranking score)
        - "price_asc|price_desc"  : total CAD price
        - "range_asc|range_desc"  : driving range (km)
        - "year_asc|year_desc"    : model year
        - "fast_asc|fast_desc"    : DC fast charging power (kW)
        - "price_per_km_asc|price_per_km_desc" : price divided by range (lower is better)

DriveKey:
    Drivetrain filter coming from UI:
        - "any"  : do not constrain
        - "awd4" : AWD or 4WD
        - "awd"  : AWD only
        - "4wd"  : 4WD only
        - "fwd"  : FWD only
        - "rwd"  : RWD only

SearchParams:
    Server-validated GET/POST parameters for /search.
    - search_query : free-text NLQ (“awd suv under 50k 7 seats”)
    - is_suv      : checkbox; if true, restrict to SUV/CUV classes
    - max_price   : maximum total CAD price
    - min_range   : minimum range in km
    - seats       : minimum seat count
    - drivetrain  : DriveKey enum
    - sort        : SortKey enum
    - page        : 1-based page index (clamped ≥1)
    - page_size   : fixed 24 (UI contracts assume this)
    - saved       : when true, show only favorited items

EVRecord:
    Normalized row for one vehicle after scraping EVTable and applying
    our normalization rules. All numeric fields are coerced to *native*
    Python ints/floats (never NumPy scalars) to keep JSON and templating safe.
"""

from typing import Optional, List, Literal

from pydantic import BaseModel, Field, ConfigDict, field_validator


# -----
# Enums
# -----

SortKey = Literal[
    "score_desc",
    "price_asc", "price_desc",
    "range_desc", "range_asc",
    "year_desc", "year_asc",
    "fast_desc", "fast_asc",
    "price_per_km_asc", "price_per_km_desc",
]

DriveKey = Literal["any", "awd4", "awd", "4wd", "fwd", "rwd"]


# -----
# SearchParams
# -----

class SearchParams(BaseModel):
    """Validated query/form inputs for /search."""
    model_config = ConfigDict(extra="ignore")

    search_query: str = ""
    is_suv: Optional[bool] = None
    max_price: Optional[float] = None
    min_range: Optional[int] = None # in km
    seats: Optional[int] = None
    drivetrain: DriveKey = "any"
    sort: SortKey = "score_desc"
    page: int = 1
    page_size: int = 24
    saved: Optional[bool] = False

# coercion helpers

    @field_validator("is_suv", mode="before")
    @classmethod
    def _coerce_bool(cls, v):
        if v is None or v == "":
            return None
        if isinstance(v, bool):
            return v
        s = str(v).lower().strip()
        return s in {"true", "1", "on", "yes"}

    @field_validator("max_price", "min_range", "seats", "page", "page_size", mode="before")
    @classmethod
    def _num_or_none(cls, v):
        """
        Accept:
          - empty → None (for optional fields)
          - "45k" → 45000
          - "42,000" → 42000
          - ints/floats → passthrough
        """
        if v is None or v == "":
            return None if isinstance(v, str) else v
        try:
            s = str(v).lower().replace(",", "").strip()
            if s.endswith("k") and s[:-1].replace(".", "", 1).isdigit():
                return float(s[:-1]) * 1000
            return float(s) if "." in s else int(s)
        except Exception:
            return v

    @field_validator("drivetrain", mode="before")
    @classmethod
    def _drive_norm(cls, v):
        if not v:
            return "any"
        s = str(v).lower().strip()
        if s in {"awd/4wd", "4x4", "awd4"}:
            return "awd4"
        if s in {"any", "awd", "4wd", "fwd", "rwd", "awd4"}:
            return s
        return "any"

    @field_validator("page", "page_size")
    @classmethod
    def _bounds(cls, v, info):
        name = info.field_name
        if name == "page":
            try:
                return max(1, int(v or 1))
            except Exception:
                return 1
        if name == "page_size":
            return 24 # page size
        return v



# -----
# EVRecord
# -----

def _to_py_float(x) -> Optional[float]:
    """Coerce NumPy scalars / strings to native float, else None."""
    if x is None or x == "":
        return None
    try:
        # numpy scalar path
        if hasattr(x, "item"):
            return float(x.item())
        return float(x)
    except Exception:
        return None


def _to_py_int(x) -> Optional[int]:
    """Coerce NumPy scalars / strings to native int, else None."""
    if x is None or x == "":
        return None
    try:
        if hasattr(x, "item"):
            x = x.item()
        return int(round(float(x)))
    except Exception:
        return None


class EVRecord(BaseModel):
    """
    Normalized EV row used across the app. All numeric fields are strictly
    native Python types (no NumPy scalars) to ensure template safety and
    JSON serializability.
    """
    model_config = ConfigDict(extra="ignore")

    # base identity
    brand: str
    model: str
    permanentId: Optional[int] = None

    # specs and price
    year: Optional[int] = None
    price_cad: Optional[float] = None
    range_km: Optional[int] = None
    seats: Optional[int] = None
    fastChargingSpeed: Optional[float] = None  # kW
    driveType: Optional[str] = None            # "AWD"|"RWD"|"FWD"|"4WD"|None
    atvType: Optional[str] = None              # "EV"|"Plug-in Hybrid"|None
    VClass: Optional[str] = None               # vehicle class (EVTable)
    tags: List[str] = Field(default_factory=list)

    # (image placeholders for car brand images not listed in /static/images)
    image_url: str = "/static/images/placeholder_car.png"
    build_link: str = "#"

    # additional attributes
    clearance: Optional[float] = None       # inches
    taxCreditAmount: Optional[float] = None
    score: float = 0.0
    doc_index: Optional[int] = None         # row id in embedding matrix
    key: Optional[str] = None                # unique key for deduplication

    @field_validator(
        "year", "range_km", "seats", "doc_index", "permanentId",
        mode="before"
    )
    @classmethod
    def _coerce_ints(cls, v):
        return _to_py_int(v)

    @field_validator(
        "price_cad", "fastChargingSpeed", "clearance", "taxCreditAmount", "score",
        mode="before"
    )
    @classmethod
    def _coerce_floats(cls, v):
        return _to_py_float(v)

    @field_validator("driveType", mode="before")
    @classmethod
    def _norm_drive(cls, v):
        if not v:
            return None
        s = str(v).strip().upper()
        if s in {"AWD", "4WD", "FWD", "RWD"}:
            return s
        # common synonyms
        if s in {"4X4"}:
            return "4WD"
        return None

    @field_validator("image_url", mode="before")
    @classmethod
    def _default_image(cls, v):
        s = (v or "").strip()
        return s or "/static/images/placeholder_car.png"

    @field_validator("build_link", mode="before")
    @classmethod
    def _default_build_link(cls, v):
        s = (v or "").strip()
        return s or "#"

    def compute_key(self) -> str:
        """Generate a stable key for this EV."""
        parts = [self.brand.lower(), self.model.lower()]
        if self.year:
            parts.append(str(self.year))
        return "|".join(parts)

    def ensure_key(self) -> None:
        """Guarantee that `self.key` is set."""
        if not self.key:
            object.__setattr__(self, "key", self.compute_key())