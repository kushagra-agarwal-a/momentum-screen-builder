#!/usr/bin/env python3
"""Reconcile STLTECH 1Y Sharpe: raw vs CA-adjusted vs Momo reference."""
from __future__ import annotations

import math
from datetime import date, timedelta

import pandas as pd

# MomoIndia screen #1 reference (2026-10-01)
MOMO_SHARPE = 10.88
MOMO_LTP = 955.35

# Demerger 2025-04-24 (from NSE corp-actions API) — before calendar 1Y start ~2025-10-01
DEMERGER_EX = date(2025, 4, 24)
DEMERGER_PRE_EQ = 86.97  # 2025-04-23 EQ close
DEMERGER_POST_BE = 65.05  # 2025-04-24 BE close


def prev_weekday(d: date) -> date:
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d


def trading_days_back(end: date, n: int) -> list[date]:
    out: list[date] = []
    d = prev_weekday(end)
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d -= timedelta(days=1)
    return sorted(out)


def fetch_be_series(symbol: str, days: list[date]) -> pd.DataFrame:
    from aynse import full_bhavcopy_df

    rows = []
    for d in days:
        iso = d.isoformat()
        try:
            df = full_bhavcopy_df(iso)
        except Exception:
            continue
        if df is None or df.empty:
            continue
        sub = df[(df["symbol"] == symbol) & (df["series"] == "BE")]
        if sub.empty:
            sub = df[(df["symbol"] == symbol) & (df["series"] == "EQ")]
        if sub.empty:
            continue
        r = sub.iloc[0]
        rows.append(
            {
                "trade_date": pd.Timestamp(iso),
                "close": float(r["close_price"]),
                "ltp": float(r.get("last_price") or r["close_price"]),
                "high": float(r.get("high_price") or r["close_price"]),
            }
        )
    return pd.DataFrame(rows).sort_values("trade_date").reset_index(drop=True)


def daily_returns(closes: list[float]) -> list[float]:
    return [(closes[i] / closes[i - 1] - 1) for i in range(1, len(closes))]


def sharpe_roc_over_vol_calendar(
    closes: list[float], dates: list[str], period: str = "1_year"
) -> dict:
    from engine.calendar_window import slice_by_calendar_period

    sl = slice_by_calendar_period(dates, closes, period)
    if not sl:
        return {"error": "insufficient calendar slice", "n": len(closes)}
    start_idx, end_idx, seg = sl
    rets = daily_returns(seg)
    m = sum(rets) / len(rets)
    var = sum((x - m) ** 2 for x in rets) / (len(rets) - 1)
    std = math.sqrt(var)
    vol_ann = std * math.sqrt(252)
    roc = seg[-1] / seg[0] - 1
    sharpe_roc = roc / vol_ann if vol_ann else None
    sharpe_mean = (m * 252) / vol_ann if vol_ann else None
    return {
        "roc": roc,
        "vol_ann": vol_ann,
        "sharpe_roc_over_vol": sharpe_roc,
        "sharpe_mean_daily_ann": sharpe_mean,
        "start_close": seg[0],
        "end_close": seg[-1],
        "start_date": dates[start_idx],
        "end_date": dates[end_idx],
        "n_rets": len(rets),
    }


def detect_demerger_factor(df: pd.DataFrame, ex: date, look: int = 5) -> dict:
    """Estimate multiplicative factor at ex-date from price ratio (pre/post)."""
    df = df.copy()
    df["trade_date"] = pd.to_datetime(df["trade_date"]).dt.date
    before = df[df["trade_date"] < ex].tail(look)
    after = df[df["trade_date"] >= ex].head(look)
    if before.empty or after.empty:
        return {"error": "no data around ex-date"}
    pre = float(before["close"].iloc[-1])
    post = float(after["close"].iloc[0])
    ratio_post_over_pre = post / pre if pre else None
    # Back-adjust: multiply all prices strictly before ex by (post/pre) continuity factor
    # For demerger, NSE drops price; backward factor = post/pre (typically << 1)
    factor = ratio_post_over_pre
    return {
        "ex_date": ex.isoformat(),
        "pre_close": pre,
        "post_close": post,
        "post_over_pre": ratio_post_over_pre,
        "back_adjust_multiply_pre_by": factor,
    }


def apply_back_adjust(df: pd.DataFrame, ex: date, factor: float) -> pd.DataFrame:
    out = df.copy()
    mask = pd.to_datetime(out["trade_date"]).dt.date < ex
    for col in ("close", "ltp", "high"):
        out.loc[mask, col] = out.loc[mask, col] * factor
    return out


def main() -> None:
    end = date(2026, 10, 1)
    days = trading_days_back(end, 280)
    print(f"Fetching STLTECH BE/EQ bhavcopy for {len(days)} sessions…")
    df = fetch_be_series("STLTECH", days)
    print(f"Loaded {len(df)} bars {df['trade_date'].min()} → {df['trade_date'].max()}")

    jump = detect_demerger_factor(df, DEMERGER_EX)
    print("\n=== Demerger 24-Apr-2025 (NSE corp-actions) ===")
    print(
        {
            "ex_date": DEMERGER_EX.isoformat(),
            "pre_eq_close": DEMERGER_PRE_EQ,
            "post_be_close": DEMERGER_POST_BE,
            "post_over_pre": DEMERGER_POST_BE / DEMERGER_PRE_EQ,
            "in_calendar_1y_window": False,
        }
    )
    print("(Calendar 1Y starts ~2025-10-01 — demerger does not fall inside it)")
    print("detect from loaded bars:", jump)

    dates = df["trade_date"].dt.strftime("%Y-%m-%d").tolist()
    closes_ltp = df["close"].tolist()
    closes_ltp[-1] = float(df["ltp"].iloc[-1])

    raw = sharpe_roc_over_vol_calendar(closes_ltp, dates)
    print("\n=== Sharpe (raw unadjusted, ROC/vol, LTP last) ===")
    print(raw)
    print(f"Momo reference Sharpe: {MOMO_SHARPE}")

    if "back_adjust_multiply_pre_by" in jump:
        factor = jump["back_adjust_multiply_pre_by"]
        adj_df = apply_back_adjust(df, DEMERGER_EX, factor)
        closes_adj = adj_df["close"].tolist()
        closes_adj[-1] = float(adj_df["ltp"].iloc[-1])
        adj = sharpe_roc_over_vol_calendar(closes_adj, dates)
        print("\n=== Sharpe (single-factor back-adjust at demerger ex-date) ===")
        print(adj)
        print(f"Gap vs Momo (adjusted - Momo): {(adj.get('sharpe_roc_over_vol') or 0) - MOMO_SHARPE:.4f}")

    # Alternative: exclude demerger window (robustness)
    df2 = df[pd.to_datetime(df["trade_date"]).dt.date != DEMERGER_EX].reset_index(drop=True)
    if len(df2) >= 30:
        c2 = df2["close"].tolist()
        c2[-1] = float(df2["ltp"].iloc[-1])
        d2 = df2["trade_date"].dt.strftime("%Y-%m-%d").tolist()
        print("\n=== Sharpe (raw, dropping ex-date bar only) ===")
        print(sharpe_roc_over_vol_calendar(c2, d2))


if __name__ == "__main__":
    main()
