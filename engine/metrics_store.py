from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime
from typing import Any

from engine.metrics import (
    above_ma,
    circuit_hits,
    compute_sort_metric,
    median_volume,
    pct_positive_days,
)
from engine.prices import closes_for_metrics, last_display_prices
from engine.sort_options import SORT_KEYS
from engine.universe import fetch_index_symbols

import pandas as pd


def ensure_metrics_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS symbol_metrics (
            symbol TEXT PRIMARY KEY,
            as_of_date TEXT NOT NULL,
            computed_at TEXT NOT NULL,
            close REAL,
            close_eod REAL,
            metrics_json TEXT NOT NULL,
            extras_json TEXT NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_metrics_as_of ON symbol_metrics(as_of_date)")
    conn.commit()


def _bench_closes(conn: sqlite3.Connection) -> list[float]:
    bench_syms = fetch_index_symbols("is_nifty_50")[:20]
    series_list: list[list[float]] = []
    for sym in bench_syms:
        rows = conn.execute(
            "SELECT close FROM eod_adjusted WHERE symbol = ? ORDER BY trade_date",
            (sym,),
        ).fetchall()
        if len(rows) > 30:
            series_list.append([float(r[0]) for r in rows])
    if not series_list:
        return []
    min_len = min(len(s) for s in series_list)
    out: list[float] = []
    for i in range(min_len):
        out.append(sum(s[-min_len + i] for s in series_list) / len(series_list))
    return out


def compute_symbol_metrics(
    sym: str,
    df: pd.DataFrame,
    bench: list[float],
) -> dict[str, Any] | None:
    if len(df) < 30:
        return None
    dates = df["trade_date"].astype(str).tolist()
    closes = closes_for_metrics(df)
    highs = df["high"].astype(float).tolist() if "high" in df.columns else closes
    volumes = df["volume"].astype(float).tolist() if "volume" in df.columns else [0.0] * len(closes)
    ltp, close_eod = last_display_prices(df)

    metrics: dict[str, float | None] = {}
    for key in SORT_KEYS:
        metrics[key] = compute_sort_metric(key, closes, highs, volumes, bench, dates)

    extras = {
        "median_volume": median_volume(volumes, dates, "1_year"),
        "away_from_high_1y": metrics.get("away_from_high_1_year"),
        "away_from_high_at": metrics.get("away_from_high_all_time"),
        "above_ma_200": above_ma(closes, 200),
        "above_ma_100": above_ma(closes, 100),
        "pct_pos_1y": pct_positive_days(closes, dates, "1_year"),
        "pct_pos_6m": pct_positive_days(closes, dates, "6_months"),
        "pct_pos_3m": pct_positive_days(closes, dates, "3_months"),
        "circuit_hits_1y": circuit_hits(closes, dates, "1_year"),
    }

    return {
        "symbol": sym,
        "as_of_date": dates[-1],
        "close": ltp,
        "close_eod": close_eod,
        "metrics": metrics,
        "extras": extras,
    }


def compute_universe_metrics(conn: sqlite3.Connection, symbols: list[str]) -> dict[str, Any]:
    ensure_metrics_schema(conn)
    bench = _bench_closes(conn)
    computed = 0
    skipped = 0
    now = datetime.now(UTC).isoformat()

    for sym in symbols:
        rows = conn.execute(
            """
            SELECT trade_date, close, ltp, high, volume
            FROM eod_adjusted WHERE symbol = ? ORDER BY trade_date
            """,
            (sym,),
        ).fetchall()
        if len(rows) < 30:
            skipped += 1
            continue
        df = pd.DataFrame(rows, columns=["trade_date", "close", "ltp", "high", "volume"])
        row = compute_symbol_metrics(sym, df, bench)
        if not row:
            skipped += 1
            continue
        conn.execute(
            """
            INSERT OR REPLACE INTO symbol_metrics
            (symbol, as_of_date, computed_at, close, close_eod, metrics_json, extras_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                sym,
                row["as_of_date"],
                now,
                row["close"],
                row["close_eod"],
                json.dumps(row["metrics"]),
                json.dumps(row["extras"]),
            ),
        )
        computed += 1

    conn.commit()
    meta = {"computed": computed, "skipped": skipped, "computed_at": now}
    conn.execute(
        "INSERT OR REPLACE INTO build_meta (key, value) VALUES (?, ?)",
        ("metrics_computed", json.dumps(meta)),
    )
    conn.commit()
    return meta
