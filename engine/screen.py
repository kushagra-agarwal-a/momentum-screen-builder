from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Literal

import numpy as np
import pandas as pd

from engine.data_loader import all_symbols_from_latest, load_series, sync_bhavcopy
from engine.metrics import (
    W_12M,
    above_ma,
    circuit_hits,
    compute_sort_metric,
    median_volume,
    pct_positive_days,
    sharpe_return,
    volatility_annualized,
)
from engine.sort_options import SORT_KEYS, sort_option
from engine.prices import closes_for_metrics, last_display_prices
from engine.universe import INDEX_LABELS, fetch_index_symbols

ApplyFiltersOn = Literal["all", "ranked"]
SeriesFilter = Literal["all", "eq"]
YesNo = Literal["yes", "no"]


@dataclass
class ScreenConfig:
    index: str = "is_nifty_500"
    sort_by: str = "average_sharpe_return_12_6_3_months"
    sort_direction: Literal["desc", "asc"] = "desc"
    sort_by_two: str = "none"
    sort_direction_two: Literal["desc", "asc"] = "desc"
    sort_by_three: str = "none"
    sort_direction_three: Literal["desc", "asc"] = "desc"
    median_volume: float = 0
    away_from_high: float = -100
    away_from_five_year_high: float = -100
    away_from_all_time_high: float = -100
    ma_200: YesNo = "no"
    ma_100: YesNo = "no"
    minimum_return_one_year: str = "none"  # none | repo (6.5% default)
    annual_return_above_volatility: YesNo = "no"
    percentage_positive_days_one_year: float = 0
    percentage_positive_days_six_months: float = 0
    percentage_positive_days_three_months: float = 0
    exclude_stocks_with_circuits_one_year: int = 0
    apply_filters_on: ApplyFiltersOn = "all"
    series: SeriesFilter = "all"
    ignore_top_beta: YesNo = "no"
    limit: int = 100
    sync_data: bool = True


REPO_RATE = 0.065


def _config_from_dict(d: dict[str, Any]) -> ScreenConfig:
    allowed = ScreenConfig.__dataclass_fields__.keys()
    return ScreenConfig(**{k: v for k, v in d.items() if k in allowed})


def resolve_universe(index_key: str) -> list[str]:
    if index_key == "is_all_nse":
        return all_symbols_from_latest()
    if index_key == "is_etf":
        return []
    return fetch_index_symbols(index_key)


def _passes_filters(row: dict[str, Any], cfg: ScreenConfig) -> bool:
    if cfg.median_volume > 0:
        mv = row.get("median_volume")
        if mv is None or mv < cfg.median_volume:
            return False

    for field_name, val in [
        ("away_from_high_1y", cfg.away_from_high),
        ("away_from_high_5y", cfg.away_from_five_year_high),
        ("away_from_high_at", cfg.away_from_all_time_high),
    ]:
        if val <= -99:
            continue
        af = row.get(field_name)
        if af is None or af < val:
            return False

    if cfg.ma_200 == "yes" and row.get("above_ma_200") is not True:
        return False
    if cfg.ma_100 == "yes" and row.get("above_ma_100") is not True:
        return False

    if cfg.minimum_return_one_year == "repo":
        roc = row.get("absolute_return_1y")
        if roc is None or roc < REPO_RATE:
            return False

    if cfg.annual_return_above_volatility == "yes":
        roc = row.get("absolute_return_1y")
        vol = row.get("volatility_1y")
        if roc is None or vol is None or roc <= vol:
            return False

    for pct, key in [
        (cfg.percentage_positive_days_one_year, "pct_pos_1y"),
        (cfg.percentage_positive_days_six_months, "pct_pos_6m"),
        (cfg.percentage_positive_days_three_months, "pct_pos_3m"),
    ]:
        if pct <= 0:
            continue
        v = row.get(key)
        if v is None or v < pct:
            return False

    if cfg.exclude_stocks_with_circuits_one_year > 0:
        hits = row.get("circuit_hits_1y", 0)
        if hits > cfg.exclude_stocks_with_circuits_one_year:
            return False

    return True


def _sort_key(row: dict[str, Any], sort_key: str, direction: str) -> tuple:
    if sort_key == "none" or sort_key not in SORT_KEYS:
        return (1, 0.0)
    v = row.get("metrics", {}).get(sort_key)
    missing = v is None or (isinstance(v, float) and np.isnan(v))
    opt = sort_option(sort_key)
    if missing:
        return (1, 0.0)
    val = float(v)
    if direction == "asc":
        val = -val if opt and opt.higher_is_better else val
    else:
        val = -val if opt and not opt.higher_is_better else -val
    return (0, val)


def run_screen(config_dict: dict[str, Any]) -> dict[str, Any]:
    cfg = _config_from_dict(config_dict)
    if cfg.sort_by not in SORT_KEYS:
        return {"error": f"Invalid sort_by: {cfg.sort_by}"}

    sync_info = None
    if cfg.sync_data:
        sync_info = sync_bhavcopy()

    symbols = resolve_universe(cfg.index)
    if not symbols:
        return {"error": "Empty universe", "sync": sync_info}

    series_map, missing = load_series(symbols)
    if not series_map:
        return {"error": "No price series loaded. Sync may have failed.", "sync": sync_info, "missing_sample": missing[:10]}

    # Benchmark: equal-weight mean close path from Nifty 50 subsample if available
    bench_syms = fetch_index_symbols("is_nifty_50")[:20]
    bench_frames = [series_map[s] for s in bench_syms if s in series_map]
    bench_closes: list[float] = []
    if bench_frames:
        min_len = min(len(f) for f in bench_frames)
        if min_len > 50:
            mat = np.vstack([f["close"].values[-min_len:] for f in bench_frames])
            bench_closes = list(np.mean(mat, axis=0))

    rows: list[dict[str, Any]] = []
    for sym, df in series_map.items():
        closes = closes_for_metrics(df)
        highs = df["high"].tolist() if "high" in df else None
        volumes = df["volume"].tolist() if "volume" in df else None
        ltp_disp, close_eod = last_display_prices(df)

        metrics: dict[str, float | None] = {}
        for key in SORT_KEYS:
            metrics[key] = compute_sort_metric(key, closes, highs, volumes, bench_closes)

        row = {
            "symbol": sym,
            "close": ltp_disp,
            "close_eod": close_eod,
            "metrics": metrics,
            "median_volume": median_volume(volumes or [], W_12M),
            "away_from_high_1y": metrics.get("away_from_high_1_year"),
            "away_from_high_at": metrics.get("away_from_high_all_time"),
            "away_from_high_5y": metrics.get("away_from_high_all_time"),
            "above_ma_200": above_ma(closes, 200),
            "above_ma_100": above_ma(closes, 100),
            "absolute_return_1y": metrics.get("absolute_return_1_year"),
            "volatility_1y": metrics.get("volatility_1_year"),
            "pct_pos_1y": pct_positive_days(closes, W_12M),
            "pct_pos_6m": pct_positive_days(closes, 126),
            "pct_pos_3m": pct_positive_days(closes, 63),
            "circuit_hits_1y": circuit_hits(closes, W_12M),
            "beta": metrics.get("beta"),
        }
        rows.append(row)

    if cfg.ignore_top_beta == "yes":
        betas = [r["beta"] for r in rows if r.get("beta") is not None]
        if betas:
            cutoff = float(np.quantile(betas, 0.9))
            rows = [r for r in rows if r.get("beta") is None or r["beta"] <= cutoff]

    if cfg.apply_filters_on == "all":
        rows = [r for r in rows if _passes_filters(r, cfg)]

    def composite_sort_key(r: dict[str, Any]) -> tuple:
        keys: list[tuple[str, str]] = [(cfg.sort_by, cfg.sort_direction)]
        if cfg.sort_by_two != "none":
            keys.insert(0, (cfg.sort_by_two, cfg.sort_direction_two))
        if cfg.sort_by_three != "none":
            keys.insert(0, (cfg.sort_by_three, cfg.sort_direction_three))
        return tuple(_sort_key(r, k, d) for k, d in keys)

    rows.sort(key=composite_sort_key)

    if cfg.apply_filters_on == "ranked":
        rows = [r for r in rows if _passes_filters(r, cfg)]

    for i, r in enumerate(rows[: cfg.limit], start=1):
        r["rank"] = i
        r["primary"] = r["metrics"].get(cfg.sort_by)

    result_rows = rows[: cfg.limit]
    return {
        "index": cfg.index,
        "index_label": INDEX_LABELS.get(cfg.index, cfg.index),
        "as_of": max(series_map[s]["trade_date"].iloc[-1] for s in series_map if len(series_map[s])),
        "universe_count": len(symbols),
        "evaluated": len(series_map),
        "sync": sync_info,
        "rows": result_rows,
    }


def main() -> None:
    import sys

    payload = json.load(sys.stdin)
    print(json.dumps(run_screen(payload), default=str))


if __name__ == "__main__":
    main()
