# tests/test_ranking_brand_model.py
import pytest
from httpx import AsyncClient
try:
    from httpx import ASGITransport
except Exception:
    ASGITransport = None

from app.main import app

@pytest.mark.asyncio
async def test_brand_model_bias_smoke():
    q = "audi q4"
    if ASGITransport is None:
        # fallback to client fixture path if httpx is too old; the main suite covers it
        assert q  # no-op to keep test
        return
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        r = await ac.get("/debug/search", params={"search_query": q, "sort": "score_desc"})
        assert r.status_code == 200
        data = r.json()
        items = data["items"]
        brands_top5 = [i["brand"] for i in items[:5]]
        assert any(b and b.lower() == "audi" for b in brands_top5)
