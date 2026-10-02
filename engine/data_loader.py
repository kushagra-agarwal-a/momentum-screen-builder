from __future__ import annotations

import json
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "prices.sqlite"


def _ensure_db() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS eod (
            trade_date TEXT NOT NULL,
            symbol TEXT NOT NULL,
            close REAL,
            ltp REAL,
            high REAL,
            volume REAL,
            series TEXT,
            PRIMARY KEY (trade_date, symbol)
        )
        """
    )
    cols = {row[1] for row in conn.execute("PRAGMA table_info(eod)").fetchall()}
    if "ltp" not in cols:
        conn.execute("ALTER TABLE eod ADD COLUMN ltp REAL")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_eod_symbol ON eod(symbol)")
    conn.commit()
    return conn


def latest_cached_date(conn: sqlite3.Connection) -> date | None:
    row = conn.execute("SELECT MAX(trade_date) FROM eod").fetchone()
    if not row or not row[0]:
        return None
    return datetime.strptime(row[0], "%Y-%m-%d").date()


def trading_days_back(end: date, count: int) -> list[date]:
    days: list[date] = []
    d = end
    while len(days) < count:
        if d.weekday() < 5:
            days.append(d)
        d -= timedelta(days=1)
        if (end - d).days > count * 3:
            break
    return sorted(days)


def sync_bhavcopy(end: date | None = None, lookback_days: int = 280) -> dict[str, Any]:
    """Download missing trading days via aynse into SQLite."""
    from aynse import full_bhavcopy_df

    end = end or date.today()
    conn = _ensure_db()
    latest = latest_cached_date(conn)
    dates = trading_days_back(end, lookback_days)

    fetched = 0
    errors: list[str] = []
    for d in dates:
        if latest and d <= latest:
            continue
        iso = d.isoformat()
        try:
            df = full_bhavcopy_df(iso)
        except Exception as e:
            errors.append(f"{iso}: {e}")
            continue
        if df is None or df.empty:
            continue
        eq = df[df["series"] == "EQ"] if "series" in df.columns else df
        rows = []
        for _, r in eq.iterrows():
            sym = str(r.get("symbol", "")).strip()
            if not sym:
                continue
            close = float(r.get("close_price") or 0)
            ltp = float(r.get("last_price") or close or 0)
            if not close:
                close = ltp
            high = r.get("high_price")
            vol = r.get("ttl_trd_qnty")
            rows.append((iso, sym, close, ltp, float(high or 0), float(vol or 0), "EQ"))
        conn.executemany(
            "INSERT OR REPLACE INTO eod (trade_date, symbol, close, ltp, high, volume, series) VALUES (?,?,?,?,?,?,?)",
            rows,
        )
        conn.commit()
        fetched += 1

    conn.close()
    return {"fetched_days": fetched, "errors": errors[:20], "db": str(DB_PATH)}


def load_series(symbols: list[str], min_days: int = 260) -> tuple[dict[str, pd.DataFrame], list[str]]:
    conn = _ensure_db()
    max_date = latest_cached_date(conn)
    if not max_date:
        conn.close()
        return {}, ["No price data cached. Run sync first."]

    start = (max_date - timedelta(days=min_days * 2)).isoformat()
    placeholders = ",".join("?" for _ in symbols)
    q = f"""
        SELECT trade_date, symbol, close, ltp, high, volume
        FROM eod
        WHERE symbol IN ({placeholders}) AND trade_date >= ?
        ORDER BY symbol, trade_date
    """
    params: list[Any] = [*symbols, start]
    df = pd.read_sql_query(q, conn, params=params)
    conn.close()

    by_sym: dict[str, pd.DataFrame] = {}
    for sym, g in df.groupby("symbol"):
        by_sym[sym] = g.reset_index(drop=True)

    missing = [s for s in symbols if s not in by_sym or len(by_sym[s]) < min_days // 2]
    return by_sym, missing


def all_symbols_from_latest() -> list[str]:
    conn = _ensure_db()
    max_date = latest_cached_date(conn)
    if not max_date:
        conn.close()
        return []
    rows = conn.execute(
        "SELECT DISTINCT symbol FROM eod WHERE trade_date = ? AND series = 'EQ'",
        (max_date.isoformat(),),
    ).fetchall()
    conn.close()
    return [r[0] for r in rows]
