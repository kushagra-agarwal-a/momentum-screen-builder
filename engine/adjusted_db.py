from __future__ import annotations

import json
import sqlite3
import time
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from aynse import full_bhavcopy_df

from engine.corporate_actions import (
    back_adjust_bars,
    corp_actions_need_adjust,
    fetch_corporate_actions,
)
from engine.universe import fetch_index_symbols

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "prices.sqlite"

UA = "momo-screen-engine/1.0"


def _conn() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH)
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS eod_raw (
            trade_date TEXT NOT NULL,
            symbol TEXT NOT NULL,
            close REAL NOT NULL,
            ltp REAL,
            high REAL,
            volume REAL,
            series TEXT,
            PRIMARY KEY (trade_date, symbol)
        )
        """
    )
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS eod_adjusted (
            trade_date TEXT NOT NULL,
            symbol TEXT NOT NULL,
            close REAL NOT NULL,
            ltp REAL,
            high REAL,
            volume REAL,
            series TEXT,
            PRIMARY KEY (trade_date, symbol)
        )
        """
    )
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS ca_cache (
            symbol TEXT PRIMARY KEY,
            fetched_at TEXT NOT NULL,
            payload TEXT NOT NULL
        )
        """
    )
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS build_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """
    )
    c.execute(
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
    c.execute("CREATE INDEX IF NOT EXISTS idx_raw_sym ON eod_raw(symbol)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_adj_sym ON eod_adjusted(symbol)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_metrics_as_of ON symbol_metrics(as_of_date)")
    c.commit()
    return c


def latest_raw_date(conn: sqlite3.Connection | None = None) -> date | None:
    own = conn is None
    conn = conn or _conn()
    row = conn.execute("SELECT MAX(trade_date) FROM eod_raw").fetchone()
    if own:
        conn.close()
    if not row or not row[0]:
        return None
    return date.fromisoformat(row[0])


def trading_days(end: date, count: int) -> list[date]:
    days: list[date] = []
    d = end
    while len(days) < count:
        if d.weekday() < 5:
            days.append(d)
        d -= timedelta(days=1)
        if (end - d).days > count * 3:
            break
    return sorted(days)


def _parse_day_df(df, symbol_set: set[str]) -> list[tuple]:
    """Prefer EQ over BE per symbol (same day)."""
    if df is None or df.empty:
        return []
    if "series" not in df.columns:
        df = df.copy()
        df["series"] = "EQ"
    rows_map: dict[str, tuple] = {}
    for _, r in df.iterrows():
        sym = str(r.get("symbol", "")).strip()
        if sym not in symbol_set:
            continue
        ser = str(r.get("series", "EQ")).strip()
        if ser not in ("EQ", "BE"):
            continue
        close = float(r.get("close_price") or 0)
        ltp = float(r.get("last_price") or close or 0)
        if not close:
            close = ltp
        if not close:
            continue
        high = float(r.get("high_price") or close)
        vol = float(r.get("ttl_trd_qnty") or r.get("total_traded_quantity") or 0)
        row = (sym, close, ltp, high, vol, ser)
        prev = rows_map.get(sym)
        if prev is None or (prev[5] == "BE" and ser == "EQ"):
            rows_map[sym] = row
    return list(rows_map.values())


def sync_incremental_raw(
    symbols: list[str],
    end: date | None = None,
    max_calendar_days: int = 21,
) -> dict[str, Any]:
    """Fetch bhavcopy for trading days after the latest row in eod_raw (up to today)."""
    end = end or date.today()
    conn = _conn()
    latest = latest_raw_date(conn)
    sym_set = set(symbols)
    dates_to_fetch: list[date] = []
    d = end
    scanned = 0
    while scanned < max_calendar_days:
        if d.weekday() < 5 and (latest is None or d > latest):
            dates_to_fetch.append(d)
        d -= timedelta(days=1)
        scanned += 1
    dates_to_fetch = sorted(set(dates_to_fetch))
    if not dates_to_fetch and latest:
        conn.close()
        return {"mode": "incremental", "days_requested": 0, "latest_in_db": latest.isoformat(), "days_with_data": 0}

    fetched = 0
    errors: list[str] = []
    t0 = time.time()
    for i, day in enumerate(dates_to_fetch):
        iso = day.isoformat()
        try:
            df = full_bhavcopy_df(iso)
        except Exception as e:
            errors.append(f"{iso}: {e}")
            continue
        parsed = _parse_day_df(df, sym_set)
        if not parsed:
            continue
        conn.executemany(
            "INSERT OR REPLACE INTO eod_raw (trade_date, symbol, close, ltp, high, volume, series) VALUES (?,?,?,?,?,?,?)",
            [(iso, sym, close, ltp, high, vol, ser) for sym, close, ltp, high, vol, ser in parsed],
        )
        conn.commit()
        fetched += 1
    conn.execute(
        "INSERT OR REPLACE INTO build_meta (key, value) VALUES (?, ?)",
        ("raw_sync_at", datetime.now(UTC).isoformat()),
    )
    conn.commit()
    conn.close()
    return {
        "mode": "incremental",
        "latest_before": latest.isoformat() if latest else None,
        "days_requested": len(dates_to_fetch),
        "days_with_data": fetched,
        "errors_sample": errors[:10],
        "elapsed_sec": round(time.time() - t0, 1),
    }


def refresh_corporate_actions(
    symbols: list[str],
    ca_delay_sec: float = 0.12,
    max_age_hours: float = 20,
) -> dict[str, Any]:
    """Re-fetch NSE CA JSON when cache is missing or older than max_age_hours."""
    import requests

    conn = _conn()
    sess = requests.Session()
    refreshed = 0
    kept = 0
    errors = 0
    cutoff = datetime.now(UTC).timestamp() - max_age_hours * 3600

    for i, sym in enumerate(symbols):
        row = conn.execute("SELECT fetched_at FROM ca_cache WHERE symbol = ?", (sym,)).fetchone()
        stale = True
        if row and row[0]:
            try:
                ts = datetime.fromisoformat(row[0].replace("Z", "+00:00")).timestamp()
                stale = ts < cutoff
            except ValueError:
                stale = True
        if not stale:
            kept += 1
            continue
        time.sleep(ca_delay_sec)
        try:
            actions = fetch_corporate_actions(sym, sess)
            _save_ca_cache(conn, sym, actions)
            refreshed += 1
        except Exception:
            errors += 1
        if (i + 1) % 100 == 0:
            conn.commit()

    conn.commit()
    conn.execute(
        "INSERT OR REPLACE INTO build_meta (key, value) VALUES (?, ?)",
        ("ca_refresh_at", datetime.now(UTC).isoformat()),
    )
    conn.commit()
    conn.close()
    return {"refreshed": refreshed, "kept_cached": kept, "errors": errors}


def trim_history(years: float = 2.0, conn: sqlite3.Connection | None = None) -> dict[str, Any]:
    own = conn is None
    conn = conn or _conn()
    latest = latest_raw_date(conn)
    if not latest:
        if own:
            conn.close()
        return {"trimmed": False}
    cutoff = (latest - timedelta(days=int(years * 365))).isoformat()
    for table in ("eod_raw", "eod_adjusted"):
        conn.execute(f"DELETE FROM {table} WHERE trade_date < ?", (cutoff,))
    conn.commit()
    if own:
        conn.close()
    return {"trimmed": True, "cutoff_before": cutoff, "latest": latest.isoformat()}


def sync_raw_bhavcopy(
    symbols: list[str],
    lookback_trading_days: int = 520,
    end: date | None = None,
) -> dict[str, Any]:
    end = end or date.today()
    sym_set = set(symbols)
    conn = _conn()
    dates = trading_days(end, lookback_trading_days)
    fetched = 0
    errors: list[str] = []
    t0 = time.time()
    for i, d in enumerate(dates):
        iso = d.isoformat()
        try:
            df = full_bhavcopy_df(iso)
        except Exception as e:
            errors.append(f"{iso}: {e}")
            continue
        parsed = _parse_day_df(df, sym_set)
        if not parsed:
            continue
        conn.executemany(
            "INSERT OR REPLACE INTO eod_raw (trade_date, symbol, close, ltp, high, volume, series) VALUES (?,?,?,?,?,?,?)",
            [(iso, sym, close, ltp, high, vol, ser) for sym, close, ltp, high, vol, ser in parsed],
        )
        conn.commit()
        fetched += 1
        if (i + 1) % 25 == 0:
            print(f"  bhavcopy {i + 1}/{len(dates)} days ({fetched} with data)", flush=True)
    conn.execute(
        "INSERT OR REPLACE INTO build_meta (key, value) VALUES (?, ?)",
        ("raw_sync_at", datetime.now(UTC).isoformat()),
    )
    conn.commit()
    conn.close()
    return {
        "lookback_trading_days": lookback_trading_days,
        "calendar_days_scanned": len(dates),
        "days_with_data": fetched,
        "errors_sample": errors[:15],
        "elapsed_sec": round(time.time() - t0, 1),
    }


def _load_ca_cached(conn: sqlite3.Connection, symbol: str) -> list[dict[str, str]] | None:
    row = conn.execute("SELECT payload, fetched_at FROM ca_cache WHERE symbol = ?", (symbol,)).fetchone()
    if not row:
        return None
    return json.loads(row[0])


def _save_ca_cache(conn: sqlite3.Connection, symbol: str, actions: list) -> None:
    payload = [{"ex_date": a.ex_date, "subject": a.subject, "series": a.series} for a in actions]
    conn.execute(
        "INSERT OR REPLACE INTO ca_cache (symbol, fetched_at, payload) VALUES (?, ?, ?)",
        (symbol, datetime.now(UTC).isoformat(), json.dumps(payload)),
    )


def build_adjusted_universe(symbols: list[str], ca_delay_sec: float = 0.15) -> dict[str, Any]:
    import requests
    from engine.corporate_actions import CorpAction

    conn = _conn()
    sess = requests.Session()
    adjusted_count = 0
    skipped_no_raw = 0
    notes_sample: dict[str, list[str]] = {}

    for i, sym in enumerate(symbols):
        rows = conn.execute(
            "SELECT trade_date, close, ltp, high, volume, series FROM eod_raw WHERE symbol = ? ORDER BY trade_date",
            (sym,),
        ).fetchall()
        if len(rows) < 30:
            skipped_no_raw += 1
            continue
        bars = [
            {
                "trade_date": r[0],
                "close": r[1],
                "ltp": r[2] if r[2] is not None else r[1],
                "high": r[3] if r[3] is not None else r[1],
                "volume": r[4],
                "series": r[5],
            }
            for r in rows
        ]
        last_date = bars[-1]["trade_date"]
        cached = _load_ca_cached(conn, sym)
        if cached is None:
            time.sleep(ca_delay_sec)
            actions = fetch_corporate_actions(sym, sess)
            _save_ca_cache(conn, sym, actions)
        else:
            actions = [
                CorpAction(ex_date=a["ex_date"], subject=a["subject"], series=a.get("series", "EQ")) for a in cached
            ]

        if not corp_actions_need_adjust(actions, last_date):
            adj_bars = bars
        else:
            adj_bars, notes = back_adjust_bars(bars, actions)
            if notes:
                notes_sample[sym] = notes[:5]
                adjusted_count += 1

        conn.execute("DELETE FROM eod_adjusted WHERE symbol = ?", (sym,))
        conn.executemany(
            "INSERT INTO eod_adjusted (trade_date, symbol, close, ltp, high, volume, series) VALUES (?,?,?,?,?,?,?)",
            [
                (b["trade_date"], sym, b["close"], b["ltp"], b["high"], b["volume"], b["series"])
                for b in adj_bars
            ],
        )
        if (i + 1) % 50 == 0:
            conn.commit()
            print(f"  adjusted {i + 1}/{len(symbols)} symbols", flush=True)

    conn.commit()
    meta = {
        "symbols": len(symbols),
        "symbols_with_adjustments": adjusted_count,
        "symbols_skipped_few_bars": skipped_no_raw,
        "adjusted_at": datetime.now(UTC).isoformat(),
        "notes_sample": notes_sample,
    }
    conn.execute("INSERT OR REPLACE INTO build_meta (key, value) VALUES (?, ?)", ("adjusted_build", json.dumps(meta)))
    conn.commit()
    conn.close()
    return meta


def build_nifty_total_market(years: float = 2.0) -> dict[str, Any]:
    symbols = fetch_index_symbols("is_nifty_total_market")
    lookback = int(years * 252) + 20
    print(f"Universe: {len(symbols)} symbols, ~{lookback} trading days", flush=True)
    print("Step 1/2: sync raw bhavcopy → eod_raw", flush=True)
    raw = sync_raw_bhavcopy(symbols, lookback_trading_days=lookback)
    print("Step 2/2: corporate actions → eod_adjusted", flush=True)
    adj = build_adjusted_universe(symbols)
    return {"universe": len(symbols), "raw": raw, "adjusted": adj, "db_path": str(DB_PATH)}


if __name__ == "__main__":
    import sys

    yrs = float(sys.argv[1]) if len(sys.argv) > 1 else 2.0
    result = build_nifty_total_market(years=yrs)
    print(json.dumps(result, indent=2))
