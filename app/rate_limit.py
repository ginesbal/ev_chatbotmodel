from __future__ import annotations
import time
from collections import deque
from typing import Deque, Dict

WINDOW_SECONDS = 60
MAX_REQUESTS = 60

_buckets: Dict[str, Deque[float]] = {}

def allow(ip: str) -> bool:
    now = time.time()
    dq = _buckets.get(ip)
    if dq is None:
        dq = _buckets[ip] = deque()
    while dq and now - dq[0] > WINDOW_SECONDS:
        dq.popleft()
    if len(dq) >= MAX_REQUESTS:
        return False
    dq.append(now)
    return True
