from __future__ import annotations

import pandas as pd


def closes_for_metrics(df: pd.DataFrame) -> list[float]:
    """LAST_PRICE (LTP) every session when present, else EOD close."""
    if df.empty or "close" not in df.columns:
        return []
    out: list[float] = []
    has_ltp = "ltp" in df.columns
    for _, row in df.iterrows():
        close = float(row["close"])
        if has_ltp and pd.notna(row["ltp"]) and float(row["ltp"]) > 0:
            out.append(float(row["ltp"]))
        else:
            out.append(close)
    return out


def last_display_prices(df: pd.DataFrame) -> tuple[float | None, float | None]:
    if df.empty:
        return None, None
    close = float(df["close"].iloc[-1]) if pd.notna(df["close"].iloc[-1]) else None
    ltp = None
    if "ltp" in df.columns and pd.notna(df["ltp"].iloc[-1]):
        ltp = float(df["ltp"].iloc[-1])
    return ltp or close, close
