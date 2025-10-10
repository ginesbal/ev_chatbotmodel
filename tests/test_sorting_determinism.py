# tests/test_sorting_determinism.py
import pytest

@pytest.mark.asyncio
async def test_score_desc_tiebreaks_are_stable(client):
    # Use a broad query to ensure many results, rely on deterministic tiebreaks in score_desc
    params = {"search_query": "", "sort": "score_desc"}
    r1 = await client.get("/debug/search", params=params)
    r2 = await client.get("/debug/search", params=params)
    assert r1.status_code == 200 and r2.status_code == 200
    a = [(i["brand"], i["model"], i["year"]) for i in r1.json()["items"]]
    b = [(i["brand"], i["model"], i["year"]) for i in r2.json()["items"]]
    assert a == b, "score_desc order changed across identical requests"
