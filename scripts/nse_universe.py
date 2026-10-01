#!/usr/bin/env python3
"""Download current Nifty index constituent lists from niftyindices.com."""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from typing import Iterable
from urllib.request import Request, urlopen

BASE = "https://www.niftyindices.com/IndexConstituent/"

INDICES: dict[str, str] = {
    "NIFTY_50": "ind_nifty50list.csv",
    "NIFTY_NEXT_50": "ind_niftynext50list.csv",
    "NIFTY_100": "ind_nifty100list.csv",
    "NIFTY_200": "ind_nifty200list.csv",
    "NIFTY_500": "ind_nifty500list.csv",
    "NIFTY_TOTAL_MARKET": "ind_niftytotalmarket_list.csv",
    "NIFTY_MIDCAP_150": "ind_niftymidcap150list.csv",
    "NIFTY_SMALLCAP_250": "ind_niftysmallcap250list.csv",
    "NIFTY_MICROCAP_250": "ind_niftymicrocap250list.csv",
    "NIFTY_LARGEMIDCAP_250": "ind_niftylargemidcap250list.csv",
}


@dataclass(frozen=True)
class Constituent:
    symbol: str
    company: str
    industry: str
    series: str
    isin: str


def fetch_constituents(index_key: str) -> list[Constituent]:
    if index_key not in INDICES:
        raise KeyError(f"Unknown index {index_key!r}. Choose from: {', '.join(INDICES)}")

    url = BASE + INDICES[index_key]
    req = Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; momentum-research/1.0)"})
    with urlopen(req, timeout=30) as resp:
        text = resp.read().decode("utf-8", errors="replace")

    reader = csv.DictReader(io.StringIO(text))
    out: list[Constituent] = []
    for row in reader:
        out.append(
            Constituent(
                symbol=(row.get("Symbol") or "").strip(),
                company=(row.get("Company Name") or "").strip(),
                industry=(row.get("Industry") or "").strip(),
                series=(row.get("Series") or "").strip(),
                isin=(row.get("ISIN Code") or "").strip(),
            )
        )
    return [c for c in out if c.symbol]


def symbols(index_key: str) -> list[str]:
    return [c.symbol for c in fetch_constituents(index_key)]


def main(argv: Iterable[str] | None = None) -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Fetch Nifty index constituents (current snapshot).")
    parser.add_argument(
        "index",
        nargs="?",
        default="NIFTY_500",
        choices=sorted(INDICES),
        help="Index key (default: NIFTY_500)",
    )
    parser.add_argument("--symbols-only", action="store_true", help="Print one symbol per line")
    args = parser.parse_args(list(argv) if argv is not None else None)

    rows = fetch_constituents(args.index)
    if args.symbols_only:
        for c in rows:
            print(c.symbol)
    else:
        print(f"{args.index}: {len(rows)} symbols")
        for c in rows[:5]:
            print(f"  {c.symbol:15} {c.company[:40]}")
        if len(rows) > 5:
            print(f"  ... ({len(rows) - 5} more)")


if __name__ == "__main__":
    main()
