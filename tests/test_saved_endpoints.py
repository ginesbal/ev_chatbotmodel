# tests/test_saved_endpoints.py
import asyncio
import os
import re
from typing import List, Tuple

import pytest


def _normalize_key(brand: str, model: str) -> str:
    """brand|model (model stripped of any '(...)' suffix), lowercased."""
    model_name = (model or "").split("(")[0].strip().lower()
    return f"{(brand or '').strip().lower()}|{model_name}"


def _count_cards(html: str) -> int:
    """Count occurrences of cards in the rendered HTML/fragment."""
    # Look for class="card" or class='card' to be resilient to attribute order.
    return len(re.findall(r'class=["\']card\b', html))


async def _sample_keys(client, want: int = 3) -> Tuple[List[str], List[dict]]:
    """
    Pull a broad page of results from /debug/search and return up to `want`
    normalized favorite keys, plus the raw item dicts (for later assertions).
    """
    # Ensure DEBUG endpoints are on for the test process
    os.environ["DEBUG"] = "true"

    r = await client.get("/debug/search", params={"search_query": "", "sort": "score_desc", "page": 1})
    assert r.status_code == 200, f"HTTP {r.status_code}: {r.text}"
    data = r.json()
    items = data.get("items", [])
    assert items, "Expected some items from /debug/search; got none"

    keys: List[str] = []
    chosen: List[dict] = []
    seen = set()
    for itm in items:
        k = _normalize_key(itm.get("brand", ""), itm.get("model", ""))
        if not itm.get("brand") or not itm.get("model"):
            continue
        if k in seen:
            continue
        seen.add(k)
        keys.append(k)
        chosen.append(itm)
        if len(keys) >= want:
            break

    assert len(keys) >= min(want, 1), f"Could not gather {want} unique keys"
    return keys, chosen


@pytest.mark.asyncio
async def test_saved_fragment_order_and_dedupe(client):
    """
    /saved/fragment should:
      - preserve the cookie order of keys
      - de-duplicate keys
    """
    keys, chosen = await _sample_keys(client, want=3)
    assert len(keys) >= 2

    # Build cookie with a specific order and a duplicate of the middle key.
    order = [keys[-1], keys[0], keys[1], keys[0]]  # e.g., k3, k1, k2, k1(dup)
    cookie_value = ",".join(order)

    r = await client.get("/saved/fragment", headers={"Cookie": f"evision_favs={cookie_value}"})
    assert r.status_code == 200, f"HTTP {r.status_code}: {r.text}"
    html = r.text

    # Extract rendered keys in the DOM order
    rendered = re.findall(r'data-fav-key="([^"]+)"', html)
    # Expect duplicates removed, order preserved: k3, k1, k2
    assert rendered[:3] == [order[0], order[1], order[2]]
    # Ensure the duplicate does not cause an extra card
    assert rendered.count(order[1]) == 1, "Duplicate key should render only once"


@pytest.mark.asyncio
async def test_saved_page_ignores_unknown_keys(client):
    """
    /saved should ignore unknown/obsolete keys gracefully and render only known ones.
    """
    keys, chosen = await _sample_keys(client, want=1)
    assert keys, "Need at least one real key"

    unknowns = ["madeup|nonexistent", "foo|bar"]
    cookie_value = ",".join(unknowns + keys)  # unknowns first, then a real one

    r = await client.get("/saved", headers={"Cookie": f"evision_favs={cookie_value}"})
    assert r.status_code == 200, f"HTTP {r.status_code}: {r.text}"
    html = r.text

    # Should contain exactly one card with the real key
    real_key = keys[0]
    rendered = re.findall(r'data-fav-key="([^"]+)"', html)
    assert real_key in rendered, "Real key from catalog must be rendered"
    # Unknown keys should not render
    for u in unknowns:
        assert u not in rendered, f"Unknown key {u} should not render"


@pytest.mark.asyncio
async def test_saved_fragment_empty_cookie_message(client):
    """
    With no evision_favs cookie, /saved/fragment should render the empty-state message.
    """
    r = await client.get("/saved/fragment")  # no cookie header
    assert r.status_code == 200, f"HTTP {r.status_code}: {r.text}"
    html = r.text
    assert "No saved vehicles yet" in html or "You haven’t saved anything yet" in html


@pytest.mark.asyncio
async def test_saved_page_counts_and_trim_flag_present(client):
    """
    Smoke test: /saved should render count text and include the trim note only when applicable.
    (We don't force a huge cookie here; just verify the normal, non-trim path.)
    """
    keys, _ = await _sample_keys(client, want=2)
    r = await client.get("/saved", headers={"Cookie": f"evision_favs={','.join(keys)}"})
    assert r.status_code == 200, f"HTTP {r.status_code}: {r.text}"
    html = r.text

    # Prefer a visible label if present; otherwise, fall back to counting cards.
    m = re.search(r"(\d+)\s+saved", html, flags=re.I)
    if m:
        assert int(m.group(1)) > 0
    else:
        assert _count_cards(html) > 0, "Expected at least one card on the saved page"

    # Trim message should not appear under normal small-cookie conditions
    assert "very large" not in html.lower()
