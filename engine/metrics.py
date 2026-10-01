from __future__ import annotations

import math
from typing import Sequence

import numpy as np

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


def absolute_return(closes: Sequence[float], window: int) -> float | None:
    c = _closes(closes)
    if len(c) < window + 1:
        return None
    start = c[-window - 1]
    end = c[-1]
    if start <= 0:
        return None
    return float(end / start - 1.0)


def daily_returns(closes: Sequence[float]) -> np.ndarray:
    c = _closes(closes)
    if len(c) < 2:
        return np.array([])
    return np.diff(c) / c[:-1]


def sharpe_return(closes: Sequence[float], window: int) -> float | None:
    c = _closes(closes)
    if len(c) < window + 1:
        return None
    rets = daily_returns(c[-window - 1 :])
    if len(rets) < 5:
        return None
    std = float(np.std(rets, ddof=1))
    if std == 0:
        return None
    roc = absolute_return(c, window)
    if roc is None:
        return None
    vol_ann = std * math.sqrt(252)
    return float(roc / vol_ann)


def average_metric(values: list[float | None]) -> float | None:
    nums = [v for v in values if v is not None and not math.isnan(v)]
    if not nums:
        return None
    return float(sum(nums) / len(nums))


def rsi(closes: Sequence[float], window: int, period: int = 14) -> float | None:
    c = _closes(closes)
    if len(c) < window:
        return None
    segment = c[-window:]
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


def volatility_annualized(closes: Sequence[float], window: int = W_12M) -> float | None:
    c = _closes(closes)
    if len(c) < window + 1:
        return None
    rets = daily_returns(c[-window - 1 :])
    if len(rets) < 5:
        return None
    return float(np.std(rets, ddof=1) * math.sqrt(252))


def beta_vs_benchmark(stock_closes: Sequence[float], bench_closes: Sequence[float], window: int = W_12M) -> float | None:
    s = _closes(stock_closes)
    b = _closes(bench_closes)
    n = min(len(s), len(b))
    if n < window + 1:
        return None
    s, b = s[-n:], b[-n:]
    rs = daily_returns(s[-window - 1 :])
    rb = daily_returns(b[-window - 1 :])
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


def pct_positive_days(closes: Sequence[float], window: int) -> float | None:
    c = _closes(closes)
    if len(c) < window + 1:
        return None
    rets = daily_returns(c[-window - 1 :])
    if len(rets) == 0:
        return None
    return float(100.0 * np.mean(rets > 0))


def circuit_hits(closes: Sequence[float], window: int, threshold: float = 0.19) -> int:
    c = _closes(closes)
    if len(c) < window + 1:
        return 0
    rets = daily_returns(c[-window - 1 :])
    return int(np.sum(np.abs(rets) >= threshold))


def above_ma(closes: Sequence[float], period: int) -> bool | None:
    c = _closes(closes)
    if len(c) < period:
        return None
    ma = float(np.mean(c[-period:]))
    return bool(c[-1] > ma)


def median_volume(volumes: Sequence[float], window: int = W_12M) -> float | None:
    v = _closes(volumes)
    if len(v) < window:
        return None
    return float(np.median(v[-window:]))


def compute_sort_metric(
    key: str,
    closes: Sequence[float],
    highs: Sequence[float] | None,
    volumes: Sequence[float] | None,
    bench_closes: Sequence[float] | None,
) -> float | None:
    """Return numeric sort value for any Sort By key."""

    def abs_w(suffix: str) -> float | None:
        w = WINDOW_MAP.get(suffix)
        return absolute_return(closes, w) if w else None

    def sharpe_w(suffix: str) -> float | None:
        w = WINDOW_MAP.get(suffix)
        return sharpe_return(closes, w) if w else None

    def rsi_w(suffix: str) -> float | None:
        w = WINDOW_MAP.get(suffix)
        return rsi(closes, w) if w else None

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

    b = beta_vs_benchmark(closes, bench_closes or closes, W_12M)
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

    if key == "return_12_minus_1_months":
        c = _closes(closes)
        if len(c) < W_12M + 1:
            return None
        start = c[-W_12M - 1]
        end = c[-W_1M - 1]
        if start <= 0:
            return None
        return float(end / start - 1.0)
    if key == "return_12_minus_two_months":
        c = _closes(closes)
        if len(c) < W_12M + 1:
            return None
        start = c[-W_12M - 1]
        end = c[-2 * W_1M - 1]
        if start <= 0:
            return None
        return float(end / start - 1.0)

    if key == "volatility_1_year":
        return volatility_annualized(closes, W_12M)
    if key == "beta":
        return b
    if key in ("price_to_earnings", "marketcap"):
        return None
    if key in ("close", "close_raw"):
        return float(_closes(closes)[-1]) if len(closes) else None
    if key == "away_from_high_all_time":
        return away_from_high(closes, highs, None)
    if key == "away_from_high_1_year":
        return away_from_high(closes, highs, W_12M)

    return None
