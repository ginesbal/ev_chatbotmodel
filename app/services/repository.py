from __future__ import annotations

import logging
from typing import List
from cachetools import TTLCache

from app.models.schemas import EVRecord
from app.utils.evtable import fetch_evtable_data, normalize_evtable_records
from app.services.nlp import precompute_embeddings, set_doc_embeddings

logger = logging.getLogger("repository")

# data snapshot TTL: 24h (seconds)
_DATA_CACHE: TTLCache = TTLCache(maxsize=2, ttl=24 * 60 * 60)  # key: "catalog" -> list[EVRecord]
_LAST_GOOD: List[EVRecord] = []

# monotonic counter that bumps whenever we load a *new* in-memory catalog.
# used to invalidate downstream result caches without global clears.
_CATALOG_VERSION: int = 0


def get_catalog_version() -> int:
    """Return the current in-process catalog version (monotonic)."""
    return _CATALOG_VERSION


def get_catalog() -> List[EVRecord]:
    """
    Return the most recent in-memory catalog without triggering a fetch.
    Falls back to _LAST_GOOD if cache is empty.
    """
    if "catalog" in _DATA_CACHE:
        return _DATA_CACHE["catalog"]
    return _LAST_GOOD[:]  # return copy to avoid accidental mutation


async def load_catalog(refresh: bool = False) -> List[EVRecord]:
    """
    Returns cached normalized records. On fetch failure, returns the last good snapshot.
    Assigns a stable doc_index so ranking can align with precomputed embeddings.

    Versioning:
      - If we repopulate the in-memory catalog, we bump _CATALOG_VERSION.
      - If we hit the _DATA_CACHE without reloading, version stays the same.
    """
    key = "catalog"
    if not refresh and key in _DATA_CACHE:
        return _DATA_CACHE[key]

    raw = await fetch_evtable_data()
    if not raw:
        logger.warning("Using last good snapshot due to fetch failure.")
        return _LAST_GOOD[:]  # copy for safety

    catalog = normalize_evtable_records(raw)

    # assign stable indices (embedd row alignment)
    for i, rec in enumerate(catalog):
        rec.doc_index = i

    _DATA_CACHE[key] = catalog
    _LAST_GOOD[:] = catalog

    # bump version only when we actually set a fresh catalog in memory.
    global _CATALOG_VERSION
    _CATALOG_VERSION += 1
    logger.info("Catalog loaded: items=%d, version=%d", len(catalog), _CATALOG_VERSION)
    return catalog


async def prepare_embeddings(policy: str = "auto") -> None:
    """
    Precompute document embeddings at startup (policy: 'auto' or 'off') and store globally.
    Safe to call multiple times; it will recompute against the current catalog.
    """
    catalog = await load_catalog(refresh=False)
    embeds, texts = precompute_embeddings(catalog, policy=policy)
    set_doc_embeddings(embeds, texts)
