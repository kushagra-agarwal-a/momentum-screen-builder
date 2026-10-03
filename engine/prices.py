from __future__ import annotations

import pandas as pd


def closes_for_metrics(df: pd.DataFrame) -> list[float]:
    """EOD close every session (consistent ROC and volatility)."""
    if df.empty or "close" not in df.columns:
        return []
    return df["close"].astype(float).tolist()


def last_display_prices(df: pd.DataFrame) -> tuple[float | None, float | None]:
    if df.empty:
        return None, None
    close = float(df["close"].iloc[-1]) if pd.notna(df["close"].iloc[-1]) else None
    ltp = None
    if "ltp" in df.columns and pd.notna(df["ltp"].iloc[-1]):
        ltp = float(df["ltp"].iloc[-1])
    return ltp or close, close
