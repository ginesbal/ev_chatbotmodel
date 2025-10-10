import logging, re, json, httpx
from pathlib import Path
from typing import List, Any, Optional
from app.models.schemas import EVRecord

logger = logging.getLogger("evtable")

PLACEHOLDER = "/static/images/placeholder_car.png"
EVTABLE_JS_URL = "https://evtable.com/all-manual-2024-03-09-1.js"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36")

def _miles_to_km(miles: Optional[float]) -> Optional[int]:
    if miles is None:
        return None
    try:
        return int(round(float(miles) * 1.60934))
    except Exception:
        return None

def _parse_float(val: Any) -> Optional[float]:
    if val is None or val == "":
        return None
    try:
        s = str(val).strip().replace("$", "").replace(",", "")
        return float(s)
    except Exception:
        return None

def _brand_logo_or_placeholder(make: str) -> str:
    make_slug = (make or "").lower().replace(" ", "_")
    image_url = f"/static/images/makes/{make_slug}.png"
    return image_url if Path(f".{image_url}").exists() else PLACEHOLDER

async def fetch_evtable_data() -> list[dict]:
    """Download EVTable’s JS and extract rowData as raw dicts."""
    headers = {"User-Agent": UA}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(EVTABLE_JS_URL, headers=headers)
            resp.raise_for_status()
            text = resp.text
    except Exception as e:
        logger.error("Failed to fetch EVTable JS: %s", e)
        return []

    m = re.search(r"var\s+rowData\s*=\s*(\[\s*\{[\s\S]*?\}\s*\])", text)
    if not m:
        logger.error("Could not find rowData array in JS file")
        return []

    try:
        return json.loads(m.group(1))
    except Exception as e:
        logger.error("Failed to parse JSON from rowData: %s", e)
        return []

def normalize_evtable_records(raw: list[dict]) -> list[EVRecord]:
    """Map EVTable rows → canonical EVRecord list with safe defaults."""
    out: list[EVRecord] = []
    for v in raw:
        try:
            brand = v.get("make") or v.get("brand") or ""
            model = v.get("model") or ""
            year  = v.get("year")

            # price_cad: prefer totalPrice; else MSRP + destinationFee; else MSRP
            msrp = _parse_float(v.get("MSRP"))
            dest = _parse_float(v.get("destinationFee")) or 0.0
            total = _parse_float(v.get("totalPrice"))
            price_cad = total or (msrp + dest if msrp is not None else None)

            # range_km: EV uses 'range' (miles), PHEV electric uses 'rangeA' (miles)
            atv = v.get("atvType")
            miles = v.get("range") if (atv or "").upper().startswith("EV") else (v.get("rangeA") or v.get("range"))
            range_km = _miles_to_km(float(miles)) if miles is not None else None

            seats = v.get("seatingCapacity")
            fcs = v.get("fastChargingSpeed") or v.get("charge240")
            try:
                fast_kw = float(str(fcs).strip()) if fcs not in (None, "") else None
            except Exception:
                fast_kw = None

            build = v.get("buildLink") or v.get("specLink") or f"https://evtable.com/model/{model.lower().replace(' ', '-')}"
            image_url = _brand_logo_or_placeholder(brand)
            tax_credit = _parse_float(v.get("taxCreditAmount"))

            rec = EVRecord(
                brand=brand,
                model=model,
                year=year,
                price_cad=price_cad,
                range_km=range_km,
                seats=seats,
                fastChargingSpeed=fast_kw,
                driveType=v.get("driveType"),
                atvType=atv,
                VClass=v.get("VClass"),
                tags=v.get("tags") or [],
                image_url=image_url,
                build_link=build,
                clearance=v.get("clearance"),
                taxCreditAmount=tax_credit,
                score=0.0,
                permanentId=v.get("permanentId")
            )
            out.append(rec)
        except Exception as e:
            logger.warning("Skipping malformed row: %s", e)
            continue

    logger.info("Normalized %d EV records", len(out))
    return out
