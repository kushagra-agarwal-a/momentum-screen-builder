"""All 64 MomoIndia-style Sort By options."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

SortKey = str


@dataclass(frozen=True)
class SortOption:
    key: SortKey
    label: str
    higher_is_better: bool = True


SORT_OPTIONS: list[SortOption] = [
    SortOption("absolute_return_1_year", "Absolute return 1 year"),
    SortOption("absolute_return_9_months", "Absolute return 9 months"),
    SortOption("absolute_return_6_months", "Absolute return 6 months"),
    SortOption("absolute_return_3_months", "Absolute return 3 months"),
    SortOption("absolute_return_1_months", "Absolute return 1 months"),
    SortOption("average_absolute_return_12_9_6_3_1_months", "Average absolute return 12 9 6 3 1 months"),
    SortOption("average_absolute_return_12_9_6_3_months", "Average absolute return 12 9 6 3 months"),
    SortOption("average_absolute_return_12_9_6_months", "Average absolute return 12 9 6 months"),
    SortOption("average_absolute_return_12_9_months", "Average absolute return 12 9 months"),
    SortOption("average_absolute_return_12_6_3_1_months", "Average absolute return 12 6 3 1 months"),
    SortOption("average_absolute_return_12_6_3_months", "Average absolute return 12 6 3 months"),
    SortOption("average_absolute_return_12_6_months", "Average absolute return 12 6 months"),
    SortOption("average_absolute_return_12_3_1_months", "Average absolute return 12 3 1 months"),
    SortOption("average_absolute_return_12_3_months", "Average absolute return 12 3 months"),
    SortOption("average_absolute_return_12_9_3_1_months", "Average absolute return 12 9 3 1 months"),
    SortOption("average_absolute_return_12_9_3_months", "Average absolute return 12 9 3 months"),
    SortOption("sharpe_return_1_year", "Sharpe return 1 year"),
    SortOption("sharpe_return_9_months", "Sharpe return 9 months"),
    SortOption("sharpe_return_6_months", "Sharpe return 6 months"),
    SortOption("sharpe_return_3_months", "Sharpe return 3 months"),
    SortOption("sharpe_return_1_months", "Sharpe return 1 months"),
    SortOption("average_sharpe_return_12_9_6_3_1_months", "Average sharpe return 12 9 6 3 1 months"),
    SortOption("average_sharpe_return_12_9_6_3_months", "Average sharpe return 12 9 6 3 months"),
    SortOption("average_sharpe_return_12_9_6_months", "Average sharpe return 12 9 6 months"),
    SortOption("average_sharpe_return_12_9_months", "Average sharpe return 12 9 months"),
    SortOption("average_sharpe_return_12_6_3_1_months", "Average sharpe return 12 6 3 1 months"),
    SortOption("average_sharpe_return_12_6_3_months", "Average sharpe return 12 6 3 months"),
    SortOption("average_sharpe_return_12_6_months", "Average sharpe return 12 6 months"),
    SortOption("average_sharpe_return_12_3_1_months", "Average sharpe return 12 3 1 months"),
    SortOption("average_sharpe_return_12_3_months", "Average sharpe return 12 3 months"),
    SortOption("average_sharpe_return_12_9_3_1_months", "Average sharpe return 12 9 3 1 months"),
    SortOption("average_sharpe_return_12_9_3_months", "Average sharpe return 12 9 3 months"),
    SortOption("average_sharpe_return_6_3_months", "Average sharpe return 6 3 months"),
    SortOption("rsi_1_year", "Rsi 1 year"),
    SortOption("rsi_9_months", "Rsi 9 months"),
    SortOption("rsi_6_months", "Rsi 6 months"),
    SortOption("rsi_3_months", "Rsi 3 months"),
    SortOption("rsi_1_months", "Rsi 1 months"),
    SortOption("average_rsi_12_9_6_3_1_months", "Average rsi 12 9 6 3 1 months"),
    SortOption("average_rsi_12_9_6_3_months", "Average rsi 12 9 6 3 months"),
    SortOption("average_rsi_12_9_6_months", "Average rsi 12 9 6 months"),
    SortOption("average_rsi_12_9_months", "Average rsi 12 9 months"),
    SortOption("average_rsi_12_6_3_1_months", "Average rsi 12 6 3 1 months"),
    SortOption("average_rsi_12_6_3_months", "Average rsi 12 6 3 months"),
    SortOption("average_rsi_12_6_months", "Average rsi 12 6 months"),
    SortOption("average_rsi_12_3_1_months", "Average rsi 12 3 1 months"),
    SortOption("average_rsi_12_3_months", "Average rsi 12 3 months"),
    SortOption("average_rsi_12_9_3_1_months", "Average rsi 12 9 3 1 months"),
    SortOption("average_rsi_12_9_3_months", "Average rsi 12 9 3 months"),
    SortOption("absolute_divide_beta_return_1_year", "Absolute divide beta return 1 year"),
    SortOption("sharpe_divide_beta_return_1_year", "Sharpe divide beta return 1 year"),
    SortOption("average_sharpe_divide_beta_return_12_9_6_3_months", "Average sharpe divide beta return 12 9 6 3 months"),
    SortOption("average_sharpe_divide_beta_return_12_6_3_months", "Average sharpe divide beta return 12 6 3 months"),
    SortOption("average_sharpe_divide_beta_return_12_6_months", "Average sharpe divide beta return 12 6 months"),
    SortOption("return_12_minus_1_months", "Return 12 minus 1 months"),
    SortOption("return_12_minus_two_months", "Return 12 minus two months"),
    SortOption("volatility_1_year", "Volatility 1 year", higher_is_better=False),
    SortOption("beta", "Beta"),
    SortOption("price_to_earnings", "Price to earnings", higher_is_better=False),
    SortOption("marketcap", "Marketcap"),
    SortOption("close", "Close"),
    SortOption("close_raw", "Close raw"),
    SortOption("away_from_high_all_time", "Away from high all time"),
    SortOption("away_from_high_1_year", "Away from high 1 year"),
]

SORT_KEYS: set[str] = {o.key for o in SORT_OPTIONS}

SortDirection = Literal["desc", "asc"]


def sort_option(key: str) -> SortOption | None:
    for o in SORT_OPTIONS:
        if o.key == key:
            return o
    return None
