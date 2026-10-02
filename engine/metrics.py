from __future__ import annotations

import math
from datetime import date, datetime
from typing import Sequence

import numpy as np

from engine.calendar_window import calendar_start, index_on_or_before_calendar_start, slice_by_calendar_period

# Trading-day approximations (252-day year)
W_1M = 21
W_3M = 63
W_6M = 126
W_9M = 189
W_12M = 252

WINDOW_MAP = {
    "1_year": W_12M,
    "9_months": W_9M,
    "6_months": W_6M,
    "3_months": W_3M,
    "1_months": W_1M,
}


def _closes(closes: Sequence[float]) -> np.ndarray:
    return np.asarray(closes, dtype=float)


def absolute_return_calendar(closes: Sequence[float], dates: Sequence[str], period: str) -> float | None:
    sl = slice_by_calendar_period(dates, closes, period)
    if not sl:
        return None
    _, _, seg = sl
    if len(seg) < 2:
        return None
    start, end = float(seg[0]), float(seg[-1])
    if start <= 0:
        return None
    return float(end / start - 1.0)


def daily_returns(closes: Sequence[float]) -> np.ndarray:
    c = _closes(closes)
    if len(c) < 2:
        return np.array([])
    return np.diff(c) / c[:-1]


def sharpe_return_calendar(closes: Sequence[float], dates: Sequence[str], period: str) -> float | None:
    sl = slice_by_calendar_period(dates, closes, period)
    if not sl:
        return None
    _, _, seg = sl
    if len(seg) < 6:
        return None
    rets = daily_returns(seg)
    if len(rets) < 5:
        return None
    std = float(np.std(rets, ddof=1))
    if std == 0:
        return None
    start, end = float(seg[0]), float(seg[-1])
    if start <= 0:
        return None
    roc = end / start - 1.0
    vol_ann = std * math.sqrt(252)
    return float(roc / vol_ann)


def average_metric(values: list[float | None]) -> float | None:
    nums = [v for v in values if v is not None and not math.isnan(v)]
    if not nums:
        return None
    return float(sum(nums) / len(nums))


def rsi_calendar(closes: Sequence[float], dates: Sequence[str], cal_period: str, period: int = 14) -> float | None:
    sl = slice_by_calendar_period(dates, closes, cal_period)
    if not sl:
        return None
    _, _, segment = sl
    segment = _closes(segment)
    if len(segment) < period + 1:
        return None
    deltas = np.diff(segment)
    gains = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)
    avg_gain = float(np.mean(gains[-period:]))
    avg_loss = float(np.mean(losses[-period:]))
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return float(100 - (100 / (1 + rs)))


def volatility_annualized_calendar(closes: Sequence[float], dates: Sequence[str], period: str = "1_year") -> float | None:
    sl = slice_by_calendar_period(dates, closes, period)
    if not sl:
        return None
    _, _, seg = sl
    rets = daily_returns(seg)
    if len(rets) < 5:
        return None
    return float(np.std(rets, ddof=1) * math.sqrt(252))


def beta_vs_benchmark(
    stock_closes: Sequence[float],
    stock_dates: Sequence[str],
    bench_closes: Sequence[float],
    period: str = "1_year",
) -> float | None:
    sl = slice_by_calendar_period(stock_dates, stock_closes, period)
    if not sl:
        return None
    _, _, seg = sl
    s = _closes(seg)
    b = _closes(bench_closes)[-len(s) :]
    if len(b) < len(s):
        return None
    rs = daily_returns(s)
    rb = daily_returns(b)
    m = min(len(rs), len(rb))
    if m < 20:
        return None
    rs, rb = rs[-m:], rb[-m:]
    var_b = float(np.var(rb, ddof=1))
    if var_b == 0:
        return None
    cov = float(np.cov(rs, rb, ddof=1)[0, 1])
    return cov / var_b


def away_from_high(closes: Sequence[float], highs: Sequence[float] | None, window: int | None) -> float | None:
    c = _closes(closes)
    if len(c) < 2:
        return None
    h = _closes(highs if highs is not None else c)
    if window is None:
        peak = float(np.max(h))
    else:
        if len(h) < window:
            return None
        peak = float(np.max(h[-window:]))
    last = float(c[-1])
    if peak <= 0:
        return None
    return float((last / peak - 1.0) * 100.0)


def pct_positive_days(closes: Sequence[float], dates: Sequence[str], period: str = "1_year") -> float | None:
    sl = slice_by_calendar_period(dates, closes, period)
    if not sl:
        return None
    _, _, seg = sl
    rets = daily_returns(seg)
    if len(rets) == 0:
        return None
    return float(100.0 * np.mean(rets > 0))


def circuit_hits(closes: Sequence[float], dates: Sequence[str], period: str = "1_year", threshold: float = 0.19) -> int:
    sl = slice_by_calendar_period(dates, closes, period)
    if not sl:
        return 0
    _, _, seg = sl
    rets = daily_returns(seg)
    return int(np.sum(np.abs(rets) >= threshold))


def above_ma(closes: Sequence[float], period: int) -> bool | None:
    c = _closes(closes)
    if len(c) < period:
        return None
    ma = float(np.mean(c[-period:]))
    return bool(c[-1] > ma)


def median_volume(volumes: Sequence[float], dates: Sequence[str], period: str = "1_year") -> float | None:
    sl = slice_by_calendar_period(dates, volumes, period)
    if not sl:
        return None
    _, _, seg = sl
    if not len(seg):
        return None
    return float(np.median(seg))


def _to_date(d: str) -> date:
    return datetime.strptime(d[:10], "%Y-%m-%d").date()


def _index_on_or_before(dates: Sequence[str], end_idx: int, target_iso: str) -> int:
    chosen = 0
    for i in range(end_idx + 1):
        if dates[i] <= target_iso:
            chosen = i
        else:
            break
    return chosen


def compute_sort_metric(
    key: str,
    closes: Sequence[float],
    highs: Sequence[float] | None,
    volumes: Sequence[float] | None,
    bench_closes: Sequence[float] | None,
    dates: Sequence[str],
) -> float | None:
    """Return numeric sort value for any Sort By key (calendar windows)."""
    if len(dates) != len(closes):
        return None

    def abs_w(suffix: str) -> float | None:
        return absolute_return_calendar(closes, dates, suffix)

    def sharpe_w(suffix: str) -> float | None:
        return sharpe_return_calendar(closes, dates, suffix)

    def rsi_w(suffix: str) -> float | None:
        return rsi_calendar(closes, dates, suffix)

    if key == "absolute_return_1_year":
        return abs_w("1_year")
    if key == "absolute_return_9_months":
        return abs_w("9_months")
    if key == "absolute_return_6_months":
        return abs_w("6_months")
    if key == "absolute_return_3_months":
        return abs_w("3_months")
    if key == "absolute_return_1_months":
        return abs_w("1_months")

    avg_abs_keys = {
        "average_absolute_return_12_9_6_3_1_months": ["1_year", "9_months", "6_months", "3_months", "1_months"],
        "average_absolute_return_12_9_6_3_months": ["1_year", "9_months", "6_months", "3_months"],
        "average_absolute_return_12_9_6_months": ["1_year", "9_months", "6_months"],
        "average_absolute_return_12_9_months": ["1_year", "9_months"],
        "average_absolute_return_12_6_3_1_months": ["1_year", "6_months", "3_months", "1_months"],
        "average_absolute_return_12_6_3_months": ["1_year", "6_months", "3_months"],
        "average_absolute_return_12_6_months": ["1_year", "6_months"],
        "average_absolute_return_12_3_1_months": ["1_year", "3_months", "1_months"],
        "average_absolute_return_12_3_months": ["1_year", "3_months"],
        "average_absolute_return_12_9_3_1_months": ["1_year", "9_months", "3_months", "1_months"],
        "average_absolute_return_12_9_3_months": ["1_year", "9_months", "3_months"],
    }
    if key in avg_abs_keys:
        return average_metric([abs_w(s) for s in avg_abs_keys[key]])

    if key == "sharpe_return_1_year":
        return sharpe_w("1_year")
    if key == "sharpe_return_9_months":
        return sharpe_w("9_months")
    if key == "sharpe_return_6_months":
        return sharpe_w("6_months")
    if key == "sharpe_return_3_months":
        return sharpe_w("3_months")
    if key == "sharpe_return_1_months":
        return sharpe_w("1_months")

    avg_sharpe_keys = {
        "average_sharpe_return_12_9_6_3_1_months": ["1_year", "9_months", "6_months", "3_months", "1_months"],
        "average_sharpe_return_12_9_6_3_months": ["1_year", "9_months", "6_months", "3_months"],
        "average_sharpe_return_12_9_6_months": ["1_year", "9_months", "6_months"],
        "average_sharpe_return_12_9_months": ["1_year", "9_months"],
        "average_sharpe_return_12_6_3_1_months": ["1_year", "6_months", "3_months", "1_months"],
        "average_sharpe_return_12_6_3_months": ["1_year", "6_months", "3_months"],
        "average_sharpe_return_12_6_months": ["1_year", "6_months"],
        "average_sharpe_return_12_3_1_months": ["1_year", "3_months", "1_months"],
        "average_sharpe_return_12_3_months": ["1_year", "3_months"],
        "average_sharpe_return_12_9_3_1_months": ["1_year", "9_months", "3_months", "1_months"],
        "average_sharpe_return_12_9_3_months": ["1_year", "9_months", "3_months"],
        "average_sharpe_return_6_3_months": ["6_months", "3_months"],
    }
    if key in avg_sharpe_keys:
        return average_metric([sharpe_w(s) for s in avg_sharpe_keys[key]])

    if key == "rsi_1_year":
        return rsi_w("1_year")
    if key == "rsi_9_months":
        return rsi_w("9_months")
    if key == "rsi_6_months":
        return rsi_w("6_months")
    if key == "rsi_3_months":
        return rsi_w("3_months")
    if key == "rsi_1_months":
        return rsi_w("1_months")

    avg_rsi_keys = {
        "average_rsi_12_9_6_3_1_months": ["1_year", "9_months", "6_months", "3_months", "1_months"],
        "average_rsi_12_9_6_3_months": ["1_year", "9_months", "6_months", "3_months"],
        "average_rsi_12_9_6_months": ["1_year", "9_months", "6_months"],
        "average_rsi_12_9_months": ["1_year", "9_months"],
        "average_rsi_12_6_3_1_months": ["1_year", "6_months", "3_months", "1_months"],
        "average_rsi_12_6_3_months": ["1_year", "6_months", "3_months"],
        "average_rsi_12_6_months": ["1_year", "6_months"],
        "average_rsi_12_3_1_months": ["1_year", "3_months", "1_months"],
        "average_rsi_12_3_months": ["1_year", "3_months"],
        "average_rsi_12_9_3_1_months": ["1_year", "9_months", "3_months", "1_months"],
        "average_rsi_12_9_3_months": ["1_year", "9_months", "3_months"],
    }
    if key in avg_rsi_keys:
        return average_metric([rsi_w(s) for s in avg_rsi_keys[key]])

    b = beta_vs_benchmark(closes, dates, bench_closes or closes, "1_year")
    if key == "absolute_divide_beta_return_1_year":
        a = abs_w("1_year")
        if a is None or b is None or b == 0:
            return None
        return a / abs(b)
    if key == "sharpe_divide_beta_return_1_year":
        s = sharpe_w("1_year")
        if s is None or b is None or b == 0:
            return None
        return s / abs(b)

    def avg_sharpe_div_beta(suffixes: list[str]) -> float | None:
        vals = []
        for suf in suffixes:
            sh = sharpe_w(suf)
            if sh is None or b is None or b == 0:
                continue
            vals.append(sh / abs(b))
        return average_metric(vals)

    if key == "average_sharpe_divide_beta_return_12_9_6_3_months":
        return avg_sharpe_div_beta(["1_year", "9_months", "6_months", "3_months"])
    if key == "average_sharpe_divide_beta_return_12_6_3_months":
        return avg_sharpe_div_beta(["1_year", "6_months", "3_months"])
    if key == "average_sharpe_divide_beta_return_12_6_months":
        return avg_sharpe_div_beta(["1_year", "6_months"])

    end_idx = len(dates) - 1
    if key == "return_12_minus_1_months":
        start_idx = index_on_or_before_calendar_start(dates, end_idx, "1_year")
        end_target = calendar_start(dates[end_idx], "1_months").isoformat()
        end_m = _index_on_or_before(dates, end_idx, end_target)
        if start_idx is None or start_idx >= end_m:
            return None
        start, end = float(closes[start_idx]), float(closes[end_m])
        return None if start <= 0 else float(end / start - 1.0)
    if key == "return_12_minus_two_months":
        start_idx = index_on_or_before_calendar_start(dates, end_idx, "1_year")
        end_d = _to_date(dates[end_idx])
        m = end_d.month - 2
        y = end_d.year
        while m <= 0:
            m += 12
            y -= 1
        end_target = date(y, m, end_d.day).isoformat()
        end_m = _index_on_or_before(dates, end_idx, end_target)
        if start_idx is None or start_idx >= end_m:
            return None
        start, end = float(closes[start_idx]), float(closes[end_m])
        return None if start <= 0 else float(end / start - 1.0)

    if key == "volatility_1_year":
        return volatility_annualized_calendar(closes, dates, "1_year")
    if key == "beta":
        return b
    if key in ("price_to_earnings", "marketcap"):
        return None
    if key in ("close", "close_raw"):
        return float(_closes(closes)[-1]) if len(closes) else None
    if key == "away_from_high_all_time":
        return away_from_high(closes, highs, None)
    if key == "away_from_high_1_year":
        sl = slice_by_calendar_period(dates, highs or closes, "1_year")
        if not sl:
            return None
        _, _, hseg = sl
        peak = float(np.max(hseg))
        last = float(_closes(closes)[-1])
        return None if peak <= 0 else float((last / peak - 1.0) * 100.0)

    return None
