# tests/test_sort_stability.py
from app.services.search_service import sort_records
from app.models.schemas import EVRecord

def mk(brand, model, price, rng, score):
    return EVRecord(brand=brand, model=model, price_cad=price, range_km=rng, score=score,
                    image_url="/static/images/placeholder_car.png", build_link="#")

def test_sort_orders_are_stable():
    items = [mk("B","Y", 50000, 400, 80.0), mk("A","Z", 40000, 450, 80.0)]
    sort_records(items, "score_desc")
    # same score → higher range first, then lower price, then brand/model
    assert items[0].range_km >= items[1].range_km
