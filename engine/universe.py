from __future__ import annotations

import csv
import io
from urllib.request import Request, urlopen

BASE = "https://www.niftyindices.com/IndexConstituent/"

INDEX_FILES: dict[str, str] = {
    "is_nifty_50": "ind_nifty50list.csv",
    "is_nifty_next_50": "ind_niftynext50list.csv",
    "is_nifty_100": "ind_nifty100list.csv",
    "is_nifty_200": "ind_nifty200list.csv",
    "is_nifty_500": "ind_nifty500list.csv",
    "is_nifty_total_market": "ind_niftytotalmarket_list.csv",
    "is_nifty_large_mid_250": "ind_niftylargemidcap250list.csv",
    "is_nifty_midcap_150": "ind_niftymidcap150list.csv",
    "is_nifty_smallcap_250": "ind_niftysmallcap250list.csv",
    "is_nifty_microcap_250": "ind_niftymicrocap250list.csv",
    "is_nifty_mid_small_400": "ind_niftymidsml400list.csv",
    "is_nifty_fo": "ind_nifty500list.csv",  # proxy: F&O subset changes; use N500 for MVP
    "is_nse_750": "ind_niftytotalmarket_list.csv",
    "is_all_nse": "ind_niftytotalmarket_list.csv",
    "is_etf": "",
}

INDEX_LABELS: dict[str, str] = {
    "is_nifty_50": "NIFTY 50",
    "is_nifty_next_50": "NIFTY NEXT 50",
    "is_nifty_100": "NIFTY 100",
    "is_nifty_200": "NIFTY 200",
    "is_nifty_500": "NIFTY 500",
    "is_nifty_total_market": "NIFTY TOTAL MARKET",
    "is_nifty_large_mid_250": "NIFTY LARGE MID 250",
    "is_nifty_midcap_150": "NIFTY MIDCAP 150",
    "is_nifty_smallcap_250": "NIFTY SMALLCAP 250",
    "is_nifty_microcap_250": "NIFTY MICROCAP 250",
    "is_nifty_mid_small_400": "NIFTY MID SMALL 400",
    "is_nifty_fo": "NIFTY F&O",
    "is_nse_750": "NSE 750 (Nifty Total Market proxy)",
    "is_all_nse": "All NSE Listed Stocks",
    "is_etf": "All NSE Listed ETFs",
}


def fetch_index_symbols(index_key: str) -> list[str]:
    if index_key == "is_etf":
        return []
    fn = INDEX_FILES.get(index_key)
    if not fn:
        raise ValueError(f"Unknown index: {index_key}")
    url = BASE + fn
    req = Request(url, headers={"User-Agent": "momo-screen-engine/1.0"})
    with urlopen(req, timeout=60) as resp:
        text = resp.read().decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    symbols: list[str] = []
    for row in reader:
        sym = (row.get("Symbol") or "").strip()
        if sym:
            symbols.append(sym)
    return symbols
