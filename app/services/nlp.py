from __future__ import annotations
import logging
from typing import List, Optional, Tuple
import numpy as np

logger = logging.getLogger("nlp")

_EMBEDDER = None
_DOC_EMBEDS: Optional[np.ndarray] = None
_DOC_TEXTS: Optional[List[str]] = None

def maybe_load_embedder(policy: str = "auto"):
    """
    policy='auto' → try to import and load, download on first run if needed.
    policy='off'  → keep None (pure token match).
    """
    global _EMBEDDER
    if policy == "off":
        _EMBEDDER = None
        return None
    if _EMBEDDER is not None:
        return _EMBEDDER
    try:
        from sentence_transformers import SentenceTransformer
        _EMBEDDER = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
        logger.info("Semantic embedder loaded.")
        return _EMBEDDER
    except Exception as e:
        logger.warning("Semantic search unavailable (falling back to token match): %s", e)
        _EMBEDDER = None
        return None

def build_doc_texts(records) -> List[str]:
    """
    Concatenate fields that matter for text relevance.
    """
    texts: List[str] = []
    for r in records:
        parts = [
            r.brand or "",
            r.model or "",
            r.VClass or "",
            r.driveType or "",
            " ".join(r.tags or []),
        ]
        texts.append(" ".join(p for p in parts if p).lower())
    return texts

def precompute_embeddings(records, policy: str = "auto") -> Tuple[Optional[np.ndarray], List[str]]:
    """
    Return (embeddings or None, texts). Embeddings normalized row-wise.
    The row index matches EVRecord.doc_index (assigned in repository).
    """
    texts = build_doc_texts(records)
    emb = None
    embder = maybe_load_embedder(policy=policy)
    if embder:
        emb = embder.encode(texts, normalize_embeddings=True)
    return emb, texts

def encode_query(text: str) -> Optional[np.ndarray]:
    if _EMBEDDER is None:
        return None
    try:
        return _EMBEDDER.encode([text], normalize_embeddings=True)[0]
    except Exception:
        return None

def set_doc_embeddings(embeds: Optional[np.ndarray], texts: List[str]) -> None:
    global _DOC_EMBEDS, _DOC_TEXTS
    _DOC_EMBEDS, _DOC_TEXTS = embeds, texts

def get_doc_embeddings() -> Tuple[Optional[np.ndarray], Optional[List[str]]]:
    return _DOC_EMBEDS, _DOC_TEXTS
