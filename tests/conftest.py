# tests/conftest.py
import os
import sys
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import AsyncClient
try:
    # httpx >= 0.24
    from httpx import ASGITransport
except Exception:  # very old httpx
    ASGITransport = None  # will fallback below

# Ensure project root is importable
REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Enable /debug/search before app import
os.environ.setdefault("DEBUG", "true")

from app.main import app  # noqa: E402


@pytest_asyncio.fixture
async def client():
    """
    Async test client using ASGITransport so we can call the app in-process.
    """
    if ASGITransport is None:
        # Fallback for very old httpx: try starlette.testclient as a last resort (sync).
        from starlette.testclient import TestClient
        tc = TestClient(app)
        # Wrap sync client to present async-ish interface for tests that await .get()
        class _Shim:
            async def get(self, *a, **kw):
                return tc.get(*a, **kw)
            async def post(self, *a, **kw):
                return tc.post(*a, **kw)
        yield _Shim()
    else:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac
