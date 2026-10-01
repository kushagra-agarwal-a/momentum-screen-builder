#!/usr/bin/env python3
"""Fetch NSE full equity bhavcopy for a trading date (post Jul 2024 format)."""

from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta


def last_weekday(d: date) -> date:
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d


def fetch_full_bhavcopy(trade_date: date):
    try:
        from aynse import full_bhavcopy_df
    except ImportError as e:
        raise SystemExit("Install aynse: pip install aynse") from e

    iso = trade_date.isoformat()
    return full_bhavcopy_df(iso)


def main() -> None:
    parser = argparse.ArgumentParser(description="Download NSE sec_bhavdata_full for one date.")
    parser.add_argument(
        "--date",
        type=lambda s: datetime.strptime(s, "%Y-%m-%d").date(),
        default=last_weekday(date.today() - timedelta(days=1)),
        help="Trade date YYYY-MM-DD (default: previous weekday)",
    )
    parser.add_argument("--out", help="Optional CSV output path")
    args = parser.parse_args()

    df = fetch_full_bhavcopy(args.date)
    eq = df[df["series"] == "EQ"] if "series" in df.columns else df
    print(f"Date {args.date}: {len(eq)} EQ rows, columns: {list(df.columns)}")

    if args.out:
        eq.to_csv(args.out, index=False)
        print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
