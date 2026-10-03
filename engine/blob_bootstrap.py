from __future__ import annotations

import gzip
import json
import os
import sqlite3
import urllib.request
from pathlib import Path

from engine.adjusted_db import DB_PATH, DATA_DIR

MANIFEST_URL = os.environ.get(
    "PRICES_MANIFEST_URL",
    "https://swz2aawt4rtld4wq.public.blob.vercel-storage.com/prices/manifest.json",
)


def _count_adjusted(conn: sqlite3.Connection) -> int:
    try:
        row = conn.execute("SELECT COUNT(*) FROM eod_adjusted").fetchone()
        return int(row[0]) if row else 0
    except sqlite3.OperationalError:
        return 0


def _count_metrics(conn: sqlite3.Connection) -> int:
    try:
        row = conn.execute("SELECT COUNT(*) FROM symbol_metrics").fetchone()
        return int(row[0]) if row else 0
    except sqlite3.OperationalError:
        return 0


def ensure_seeded_db(min_adjusted_rows: int = 100_000, min_metrics: int = 400) -> dict:
    """
    CI starts with no data/ — download the published Blob DB before incremental daily updates.
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if DB_PATH.is_file():
        conn = sqlite3.connect(DB_PATH)
        adj = _count_adjusted(conn)
        met = _count_metrics(conn)
        conn.close()
        if adj >= min_adjusted_rows and met >= min_metrics:
            return {"seeded": False, "reason": "local_db_ok", "eod_adjusted_rows": adj, "symbol_metrics": met}

    if not MANIFEST_URL:
        return {"seeded": False, "reason": "no_manifest_url"}

    with urllib.request.urlopen(MANIFEST_URL, timeout=120) as resp:
        manifest = json.loads(resp.read().decode())
    url = manifest.get("download_url")
    if not url:
        return {"seeded": False, "reason": "manifest_missing_download_url"}

    gz_path = DB_PATH.with_suffix(".sqlite.gz")
    with urllib.request.urlopen(url, timeout=600) as resp:
        gz_path.write_bytes(resp.read())

    with gzip.open(gz_path, "rb") as f_in, open(DB_PATH, "wb") as f_out:
        while True:
            chunk = f_in.read(1024 * 1024)
            if not chunk:
                break
            f_out.write(chunk)

    conn = sqlite3.connect(DB_PATH)
    adj = _count_adjusted(conn)
    met = _count_metrics(conn)
    conn.close()
    return {
        "seeded": True,
        "from": url,
        "eod_adjusted_rows": adj,
        "symbol_metrics": met,
        "manifest_built_at": manifest.get("built_at"),
    }
