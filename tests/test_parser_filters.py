# tests/test_parser_filters.py
import pytest
from app.services.search_service import parse_query, filter_records
from app.models.schemas import EVRecord

def mk(brand="Brand", model="X", price=40000, rng=420, seats=5, vclass="Small SUVs", drive="AWD", fastkw=150):
    return EVRecord(
        brand=brand, model=model, year=2024, price_cad=price, range_km=rng, seats=seats,
        fastChargingSpeed=fastkw, driveType=drive, atvType="EV", VClass=vclass, tags=[],
        image_url="/static/images/placeholder_car.png", build_link="#", clearance=None, taxCreditAmount=None
    )

def test_parse_basic():
    pq = parse_query("luxury suv under 50k 7 seats >150kW awd")
    assert pq.is_suv is True
    assert pq.max_price == 50000
    assert pq.seats == 7
    assert pq.min_fast_kw == 150
    assert pq.drive_filter == "AWD"

def test_filter_and_combination():
    recs = [mk(price=60000), mk(price=45000, seats=7), mk(price=30000, rng=300)]
    pq = parse_query("under 50000 7 seats")
    out = filter_records(recs, pq, explicit_is_suv=None)
    assert all(r.price_cad <= 50000 for r in out)
    assert all((r.seats or 0) >= 7 for r in out)

def test_tightening_filters_reduces_results():
    recs = [mk(price=40000, rng=400), mk(price=45000, rng=450), mk(price=60000, rng=500)]
    pq1 = parse_query("under 60000 350 km")
    pq2 = parse_query("under 50000 450 km")
    out1 = filter_records(recs, pq1, explicit_is_suv=None)
    out2 = filter_records(recs, pq2, explicit_is_suv=None)
    assert len(out2) <= len(out1)
