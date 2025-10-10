# parity test for saved vehicles endpoints
import re
import urllib.parse as _url
import pytest

from app.main import app

try:
    from httpx import AsyncClient
    from httpx import ASGITransport
except Exception:  # pragma: no cover
    AsyncClient = None
    ASGITransport = None


def _count_cards(html: str) -> int:
    """
    Count EV cards by their data-fav-key marker (more precise than class="card").
    """
    return len(re.findall(r'data-fav-key="[^"]+"', html))


async def _pick_cookie_keys(ac: "AsyncClient", limit: int = 5) -> list[str]:
    """
    Pick a few EVs from the catalog (via /debug/search) and return normalized
    cookie keys in the legacy "brand|model" format that the server accepts.
    """
    r = await ac.get("/debug/search", params={"search_query": "", "page": 1})
    r.raise_for_status()
    data = r.json()
    items = data.get("items", [])[:limit]
    keys = []
    for it in items:
        brand = (it.get("brand") or "").strip().lower()
        model = (it.get("model") or "").split("(")[0].strip().lower()
        if brand and model:
            keys.append(f"{brand}|{model}")
    return keys


@pytest.mark.asyncio
async def test_saved_counts_fragment_vs_page_parity():
    if ASGITransport is None or AsyncClient is None:
        pytest.skip("httpx too old for ASGITransport; parity test skipped")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # build cookie with valid keys plus duplicates and one bogus
        base_keys = await _pick_cookie_keys(ac, limit=5)
        assert base_keys, "Could not pick any EV keys from /debug/search"

        noisy = base_keys + [base_keys[0]] + ["unknown|does-not-exist"]
        cookie_val = _url.quote(",".join(noisy))
        ac.cookies.set("evision_favs", cookie_val, path="/")

        # full saved page test
        r_page = await ac.get("/saved")
        assert r_page.status_code == 200, f"/saved HTTP {r_page.status_code}"
        html_page = r_page.text
        page_count = _count_cards(html_page)

        # fragment endpoint test
        r_frag = await ac.get("/saved/fragment", headers={"X-Requested-With": "fetch"})
        assert r_frag.status_code == 200, f"/saved/fragment HTTP {r_frag.status_code}"
        html_frag = r_frag.text
        frag_count = _count_cards(html_frag)

        # parity check: fragment should match page
        assert frag_count == page_count, (
            f"Saved count mismatch: fragment={frag_count}, page={page_count}. "
            f"Cookie={_url.unquote(cookie_val)}"
        )

        # upper bound: should not exceed number of unique valid keys
        unique_requested = len(set(base_keys))  # bogus + duplicate shouldn't increase this
        assert page_count <= unique_requested, (
            f"Server rendered more cards ({page_count}) than unique requested keys "
            f"({unique_requested}). Cookie={_url.unquote(cookie_val)}"
        )
