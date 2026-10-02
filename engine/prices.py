from __future__ import annotations

import pandas as pd


def closes_for_metrics(df: pd.DataFrame) -> list[float]:
    """Use LTP on the latest row when present (MomoIndia-style), else EOD close."""
    if df.empty or "close" not in df.columns:
        return []
    closes = df["close"].astype(float).tolist()
    if "ltp" in df.columns:
        last_ltp = df["ltp"].iloc[-1]
        if pd.notna(last_ltp) and float(last_ltp) > 0:
            closes[-1] = float(last_ltp)
    return closes


def last_display_prices(df: pd.DataFrame) -> tuple[float | None, float | None]:
    if df.empty:
        return None, None
    close = float(df["close"].iloc[-1]) if pd.notna(df["close"].iloc[-1]) else None
    ltp = None
    if "ltp" in df.columns and pd.notna(df["ltp"].iloc[-1]):
        ltp = float(df["ltp"].iloc[-1])
    return ltp or close, close
