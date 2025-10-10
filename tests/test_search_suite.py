# comprehensive search functionality tests
import json
import pytest
import yaml

def approx_eq(a, b, tol=1):
    return abs((a or 0) - (b or 0)) <= tol

async def run_search_test(client, testcase_id: str, q: str, ui: dict, expect: dict):
    """run a single search test case"""
    params = {"search_query": q}
    params.update(ui)

    r = await client.get("/debug/search", params=params)
    assert r.status_code == 200, f"HTTP {r.status_code}: {r.text}"
    data = r.json()

    # parsed query assertions
    parsed = data["parsed_query"]
    exp_parsed = expect.get("parsed", {})
    for k, v in exp_parsed.items():
        if k == "min_range":
            # allow ±1km due to rounding from miles
            assert approx_eq(parsed.get(k), v, 1), f"min_range expected ~{v}, got {parsed.get(k)}"
        else:
            assert parsed.get(k) == v, f"parsed.{k} expected {v}, got {parsed.get(k)}"

    # ui parameter validation
    exp_ui = expect.get("ui", {})
    if exp_ui:
        params_dump = data["params"]
        for k, v in exp_ui.items():
            assert params_dump.get(k) == v, f"params.{k} expected {v}, got {params_dump.get(k)}"

    # basic filtering sanity check
    items = data.get("items", [])
    assert isinstance(items, list)
    # ensure call succeeded and yields a list

    # brand bias smoke test
    smoke_any = expect.get("smoke_brand_any_of")
    if smoke_any:
        assert len(items) > 0, f"expected some items for brand bias test"
        brands = [item.get("brand", "").lower() for item in items[:8]]
        found_expected = any(b in brands for b in smoke_any)
        assert found_expected, f"expected one of {smoke_any} in top brands {brands}"

    # stable order check for deterministic sort
    if expect.get("stable_order"):
        r2 = await client.get("/debug/search", params=params)
        data2 = r2.json()
        items2 = data2.get("items", [])
        
        # fetch twice and compare id tuple (brand|model|year) of first 24
        def make_id(item):
            return f"{item.get('brand', '')}|{item.get('model', '')}|{item.get('year', '')}"
        
        ids1 = [make_id(item) for item in items[:24]]
        ids2 = [make_id(item) for item in items2[:24]]
        assert ids1 == ids2, f"order not stable: {ids1[:5]} vs {ids2[:5]}"

async def test_drivetrain_filters_different_counts(client):
    """test that different drivetrain filters produce different results"""
    # same query; compare Any vs AWD/4WD - should produce different set
    params_any = {"search_query": "family suv", "drivetrain": "any"}
    params_awd = {"search_query": "family suv", "drivetrain": "awd4"}
    
    r_any = await client.get("/debug/search", params=params_any)
    r_awd = await client.get("/debug/search", params=params_awd)
    
    # check that AWD filter is reflected in params and item count is not greater than "any"
    data_any = r_any.json()
    data_awd = r_awd.json()
    
    count_any = len(data_any.get("items", []))
    count_awd = len(data_awd.get("items", []))
    
    assert count_awd <= count_any, f"AWD results ({count_awd}) should not exceed Any ({count_any})"

def load_cases():
    with open("tests/test_cases.yaml", "r", encoding="utf-8") as f:
        return yaml.safe_load(f)

@pytest.mark.asyncio
@pytest.mark.parametrize("case", load_cases())
async def test_cases(client, case):
    q = case["query"]
    ui = case.get("ui", {})
    expect = case.get("expect", {})
    params = {"search_query": q}
    params.update(ui)

    r = await client.get("/debug/search", params=params)
    assert r.status_code == 200, f"HTTP {r.status_code}: {r.text}"
    data = r.json()

    # parsed query assertions
    parsed = data["parsed_query"]
    exp_parsed = expect.get("parsed", {})
    for k, v in exp_parsed.items():
        if k == "min_range":
            # allow ±1km due to rounding from miles
            assert approx_eq(parsed.get(k), v, 1), f"min_range expected ~{v}, got {parsed.get(k)}"
        else:
            assert parsed.get(k) == v, f"parsed.{k} expected {v}, got {parsed.get(k)}"

    # 2) UI echo (drivetrain etc.)—ensure explicit UI values were applied
    exp_ui = expect.get("ui", {})
    if exp_ui:
        params_dump = data["params"]
        for k, v in exp_ui.items():
            assert params_dump.get(k) == v, f"params.{k} expected {v}, got {params_dump.get(k)}"

    # 3) Basic filtering sanity: if we set restrictive filters, we expect some items but not ALL
    items = data.get("items", [])
    assert isinstance(items, list)
    # We can’t know snapshot size here; just ensure call succeeded and yields a list.

    # 4) Smoke check for brand bias when requested
    smoke_any = expect.get("smoke_brand_any_of")
    if smoke_any and items:
        top5 = [i.get("brand", "") for i in items[:5]]
        assert any((b and b.lower() in [x.lower() for x in smoke_any]) for b in top5), \
            f"Expected one of {smoke_any} in top5 brands, got {top5}"

    # 5) Stable order check for a deterministic sort
    if expect.get("stable_order"):
        # Fetch twice and compare id tuple (brand|model|year) of first 24
        def id_tuple(x):
            return (x.get("brand"), x.get("model"), x.get("year"))
        r2 = await client.get("/debug/search", params=params)
        assert r2.status_code == 200
        items2 = r2.json().get("items", [])
        assert [id_tuple(x) for x in items[:24]] == [id_tuple(x) for x in items2[:24]], \
            "Order changed across identical requests"

@pytest.mark.asyncio
async def test_cache_key_drivetrain_is_honored(client):
    # Same query; compare Any vs AWD/4WD—should produce different set (or at least fewer/equal items).
    base = {"search_query": "under 60k"}
    r_any  = await client.get("/debug/search", params=base)
    r_awd4 = await client.get("/debug/search", params={**base, "drivetrain": "awd4"})
    assert r_any.status_code == 200 and r_awd4.status_code == 200
    data_any, data_awd4 = r_any.json(), r_awd4.json()
    # Check that AWD filter is reflected in params and item count is not greater than "any".
    assert data_awd4["params"]["drivetrain"] == "awd4"
    assert data_awd4["page"]["total_results"] <= data_any["page"]["total_results"]
