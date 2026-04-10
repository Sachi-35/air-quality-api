#!/usr/bin/env python3
"""
cli.py — Command-line tool for the Air Quality Monitoring API.

Usage:
    python cli.py cities [--limit N]
    python cli.py aqi <city>
    python cli.py trend <city> [--param PARAM] [--limit N]
    python cli.py health
    python cli.py cache-clear

Requires the server to be running, OR use --direct to call OpenAQ directly
without the server (useful for debugging).
"""
import argparse
import asyncio
import json
import sys
import os

# Allow running from project root without installing the package
sys.path.insert(0, os.path.dirname(__file__))


# ── Formatting helpers ────────────────────────────────────────────────────────

CATEGORY_COLOURS = {
    "Good":                              "\033[92m",   # green
    "Moderate":                          "\033[93m",   # yellow
    "Unhealthy for Sensitive Groups":    "\033[33m",   # orange-ish
    "Unhealthy":                         "\033[91m",   # red
    "Very Unhealthy":                    "\033[35m",   # magenta
    "Hazardous":                         "\033[31m",   # dark red
}
RESET = "\033[0m"
BOLD  = "\033[1m"


def colour(text: str, category: str) -> str:
    c = CATEGORY_COLOURS.get(category, "")
    return f"{c}{text}{RESET}" if c else text


def aqi_bar(aqi: int, width: int = 30) -> str:
    filled = max(1, round(aqi / 500 * width))
    bar = "█" * filled + "░" * (width - filled)
    return bar


def print_aqi_card(data: dict) -> None:
    cat = data.get("category", "")
    aqi = data.get("aqi", 0)
    print()
    print(f"  {BOLD}City:{RESET}       {data.get('city')} ({data.get('country')})")
    print(f"  {BOLD}AQI:{RESET}        {colour(str(aqi), cat)}  {colour(aqi_bar(aqi), cat)}")
    print(f"  {BOLD}Category:{RESET}   {colour(cat, cat)}")
    print(f"  {BOLD}Dominant:{RESET}   {data.get('dominant_pollutant', '?').upper()}")
    if data.get("last_updated"):
        print(f"  {BOLD}Updated:{RESET}    {data['last_updated']}")
    print()
    print(f"  {BOLD}{'Parameter':<12} {'Value':>10}  Unit{RESET}")
    print("  " + "─" * 36)
    for m in data.get("measurements", []):
        print(f"  {m['parameter']:<12} {m['value']:>10.2f}  {m['unit']}")
    print()


def print_trend(data: dict) -> None:
    trend = data.get("trend", [])
    if not trend:
        print("  No trend data available.")
        return
    print()
    print(f"  {BOLD}City:{RESET}      {data['city']}")
    print(f"  {BOLD}Parameter:{RESET} {data['parameter'].upper()}  ({data['unit']})")
    print()
    print(f"  {BOLD}{'Timestamp':<26} {'AQI':>5}  Category{RESET}")
    print("  " + "─" * 60)
    for pt in trend:
        cat = pt.get("category", "")
        ts  = pt["timestamp"][:19].replace("T", " ")
        aqi = pt["aqi"]
        print(f"  {ts:<26} {colour(str(aqi).rjust(5), cat)}  {colour(cat, cat)}")
    print()


def print_cities(cities: list, limit: int) -> None:
    print()
    print(f"  {BOLD}{'City':<30} {'Country':<10} {'Stations':>8}{RESET}")
    print("  " + "─" * 52)
    for c in cities[:limit]:
        print(f"  {c['city']:<30} {c['country']:<10} {c['locations_count']:>8}")
    print()


# ── HTTP via running server ───────────────────────────────────────────────────

async def call_server(path: str, params: dict, base_url: str) -> dict | list:
    import httpx
    url = f"{base_url}{path}"
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(url, params=params)
        if resp.status_code >= 400:
            print(f"\n  ✗ Error {resp.status_code}: {resp.text}\n")
            sys.exit(1)
        return resp.json()


# ── Direct mode (no server needed) ───────────────────────────────────────────

async def direct_aqi(city: str) -> None:
    """Call OpenAQ + run AQI calculation locally, no server required."""
    from services.openaq_client import fetch_latest_by_city
    from services.preprocessor import extract_measurements_from_location, extract_country
    from services.aqi_calculator import compute_overall_aqi

    print(f"\n  Fetching from OpenAQ directly for: {BOLD}{city}{RESET} …")
    locations = await fetch_latest_by_city(city)
    all_m = []
    country = "??"
    for loc in locations:
        all_m.extend(extract_measurements_from_location(loc))
        country = extract_country(loc)

    param_map = {}
    for m in all_m:
        ex = param_map.get(m.parameter)
        if ex is None or m.value > ex["value"]:
            param_map[m.parameter] = {"parameter": m.parameter, "value": m.value}

    aqi_val, cat, dominant = compute_overall_aqi(list(param_map.values()))
    print_aqi_card({
        "city": city, "country": country,
        "aqi": aqi_val, "category": cat,
        "dominant_pollutant": dominant,
        "measurements": [{"parameter": m.parameter, "value": m.value, "unit": m.unit} for m in all_m],
    })


# ── Main ──────────────────────────────────────────────────────────────────────

async def main():
    parser = argparse.ArgumentParser(
        prog="cli.py",
        description="Air Quality Monitoring CLI",
    )
    parser.add_argument("--base-url", default="http://localhost:8000", help="API base URL")
    parser.add_argument("--direct", action="store_true", help="Call OpenAQ directly (no server)")
    parser.add_argument("--json", action="store_true", dest="as_json", help="Raw JSON output")

    sub = parser.add_subparsers(dest="command", required=True)

    # cities
    p_cities = sub.add_parser("cities", help="List cities with monitoring stations")
    p_cities.add_argument("--limit", type=int, default=20, help="Max results to show")

    # aqi
    p_aqi = sub.add_parser("aqi", help="Current AQI for a city")
    p_aqi.add_argument("city", help="City name, e.g. Delhi")

    # trend
    p_trend = sub.add_parser("trend", help="AQI trend for a city")
    p_trend.add_argument("city", help="City name")
    p_trend.add_argument("--param", default="pm25", help="Pollutant (default: pm25)")
    p_trend.add_argument("--limit", type=int, default=24, help="Number of readings")

    # health
    sub.add_parser("health", help="Check API health")

    # cache-clear  (server must expose it; direct calls services directly)
    sub.add_parser("cache-clear", help="Clear the in-memory cache (direct mode only)")

    args = parser.parse_args()

    # ── dispatch ──────────────────────────────────────────────────────────────

    if args.command == "cities":
        if args.direct:
            from services.openaq_client import fetch_cities
            from services.preprocessor import extract_city_name, extract_country
            locs = await fetch_cities(200)
            seen = {}
            for loc in locs:
                c = extract_city_name(loc); co = extract_country(loc)
                k = f"{c}|{co}"
                if k in seen: seen[k]["locations_count"] += 1
                else: seen[k] = {"city": c, "country": co, "locations_count": 1}
            data = list(seen.values())
        else:
            data = await call_server("/cities", {"limit": args.limit}, args.base_url)
        if args.as_json:
            print(json.dumps(data, indent=2))
        else:
            print_cities(data, args.limit)

    elif args.command == "aqi":
        if args.direct:
            await direct_aqi(args.city)
            return
        data = await call_server("/aqi", {"city": args.city}, args.base_url)
        if args.as_json:
            print(json.dumps(data, indent=2, default=str))
        else:
            print_aqi_card(data)

    elif args.command == "trend":
        if args.direct:
            print("  --direct not supported for trend; run the server first.")
            sys.exit(1)
        data = await call_server(
            "/trend",
            {"city": args.city, "parameter": args.param, "limit": args.limit},
            args.base_url,
        )
        if args.as_json:
            print(json.dumps(data, indent=2, default=str))
        else:
            print_trend(data)

    elif args.command == "health":
        data = await call_server("/health", {}, args.base_url)
        if args.as_json:
            print(json.dumps(data, indent=2))
        else:
            status = data.get("status", "?")
            icon = "✓" if status == "ok" else "⚠"
            col = "\033[92m" if status == "ok" else "\033[91m"
            print(f"\n  {col}{BOLD}{icon} Status: {status.upper()}{RESET}")
            print(f"  OpenAQ:    {data['upstream']['openaq']}")
            print(f"  Cache:     {data['cache']['entries']} entries  (TTL {data['cache']['ttl_seconds']}s)")
            print(f"  Timestamp: {data['timestamp']}\n")

    elif args.command == "cache-clear":
        import services.cache as cache
        before = len(cache._store)
        cache.clear()
        print(f"\n  ✓ Cache cleared ({before} entries removed)\n")


if __name__ == "__main__":
    asyncio.run(main())