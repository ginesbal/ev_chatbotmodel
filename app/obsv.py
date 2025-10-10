
from __future__ import annotations

import json
import time
import uuid
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

JSON_PRIMITIVES = (str, int, float, bool, type(None))


def json_safe(obj: Any) -> Any:
    """
    Make arbitrary objects safe to put into structured logs.

    - numpy scalars -> native Python (via .item())
    - pydantic models -> dict (via model_dump)
    - dict/list/tuple/set -> recursively json_safe
    - unknown objects -> vars(obj) or str(obj)
    """
    try:
        import numpy as np  # optional
        np_scalar = (np.generic,)
    except Exception:  # pragma: no cover
        np_scalar = tuple()

    if isinstance(obj, JSON_PRIMITIVES):
        return obj
    if np_scalar and isinstance(obj, np_scalar):
        return obj.item()
    if isinstance(obj, dict):
        return {str(k): json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [json_safe(v) for v in obj]
    if hasattr(obj, "model_dump"):
        try:
            return json_safe(obj.model_dump())
        except Exception:
            pass
    if hasattr(obj, "__dict__"):
        try:
            return json_safe(vars(obj))
        except Exception:
            pass
    try:
        json.dumps(obj)
        return obj
    except Exception:
        return str(obj)


class RequestIdMiddleware(BaseHTTPMiddleware):
    """
    Inject a per-request ID that you can correlate in logs.
    - Reads X-Request-ID header if provided, else generates uuid4.
    - Exposes it as request.state.request_id and echoes in response header.
    """

    header_name: str = "X-Request-ID"
    state_attr: str = "request_id"

    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get(self.header_name) or str(uuid.uuid4())
        setattr(request.state, self.state_attr, rid)
        response = await call_next(request)
        response.headers[self.header_name] = rid
        return response


class Timing:
    """Simple context manager for wall-clock timing (ms)."""

    __slots__ = ("_t0",)

    def __enter__(self):
        self._t0 = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc, tb):
        pass

    @property
    def ms(self) -> float:
        return (time.perf_counter() - self._t0) * 1000.0
