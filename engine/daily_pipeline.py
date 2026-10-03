from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from engine.adjusted_db import (
    DB_PATH,
    _conn,
    build_adjusted_universe,
    refresh_corporate_actions,
    sync_incremental_raw,
    trim_history,
)
from engine.blob_bootstrap import ensure_seeded_db
from engine.metrics_store import compute_universe_metrics
from engine.universe import fetch_index_symbols

DEFAULT_INDEX = "is_nifty_total_market"
KEEP_YEARS = 2.0


def run_daily_pipeline(
    index_key: str = DEFAULT_INDEX,
    refresh_ca: bool = True,
    publish: bool = False,
) -> dict:
    seed = ensure_seeded_db()
    print(f"[daily] db bootstrap: {seed}", flush=True)

    symbols = fetch_index_symbols(index_key)
    conn = _conn()

    print(f"[daily] universe {index_key}: {len(symbols)} symbols", flush=True)
    print("[daily] incremental bhavcopy → eod_raw", flush=True)
    raw = sync_incremental_raw(symbols)

    if refresh_ca:
        print("[daily] refresh NSE corporate actions → ca_cache", flush=True)
        ca = refresh_corporate_actions(symbols)
    else:
        ca = {"skipped": True}

    print("[daily] rebuild eod_adjusted", flush=True)
    adj = build_adjusted_universe(symbols)

    print("[daily] trim history", flush=True)
    trim = trim_history(years=KEEP_YEARS)

    print("[daily] compute symbol_metrics", flush=True)
    metrics = compute_universe_metrics(conn, symbols)
    conn.close()

    result = {
        "pipeline": "daily",
        "index": index_key,
        "symbols": len(symbols),
        "raw": raw,
        "corporate_actions": ca,
        "adjusted": adj,
        "trim": trim,
        "metrics": metrics,
        "db_path": str(DB_PATH),
        "finished_at": datetime.now(UTC).isoformat(),
    }
    conn2 = _conn()
    conn2.execute(
        "INSERT OR REPLACE INTO build_meta (key, value) VALUES (?, ?)",
        ("pipeline_daily", json.dumps(result)),
    )
    conn2.commit()
    conn2.close()

    if publish:
        print("[daily] publish to Blob (requires env)", flush=True)
        import subprocess

        r = subprocess.run(
            ["node", str(Path(__file__).resolve().parent.parent / "scripts/publish_prices_db.mjs")],
            check=False,
        )
        result["publish_exit_code"] = r.returncode

    return result


if __name__ == "__main__":
    pub = "--publish" in sys.argv
    skip_ca = "--skip-ca" in sys.argv
    idx = DEFAULT_INDEX
    for arg in sys.argv[1:]:
        if arg.startswith("--index="):
            idx = arg.split("=", 1)[1]
    out = run_daily_pipeline(index_key=idx, refresh_ca=not skip_ca, publish=pub)
    print(json.dumps({k: v for k, v in out.items() if k != "pipeline"}, indent=2))
