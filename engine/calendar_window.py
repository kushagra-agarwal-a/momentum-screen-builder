from __future__ import annotations

from datetime import date, datetime
from typing import Sequence

PERIOD_OFFSET: dict[str, tuple[int, int]] = {
    "1_year": (1, 0),
    "9_months": (0, 9),
    "6_months": (0, 6),
    "3_months": (0, 3),
    "1_months": (0, 1),
}


def _to_date(d: str | date) -> date:
    if isinstance(d, date):
        return d
    return datetime.strptime(d[:10], "%Y-%m-%d").date()


def calendar_start(end: str | date, period: str) -> date:
    end_d = _to_date(end)
    years, months = PERIOD_OFFSET[period]
    y, m, day = end_d.year - years, end_d.month - months, end_d.day
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, day)


def index_on_or_before_calendar_start(dates: Sequence[str], end_idx: int, period: str) -> int | None:
    if end_idx < 0 or not len(dates):
        return None
    target = calendar_start(dates[end_idx], period).isoformat()
    chosen = -1
    for i in range(end_idx + 1):
        if dates[i] <= target:
            chosen = i
        else:
            break
    if chosen >= 0:
        return chosen
    return 0 if end_idx >= 0 else None


def slice_by_calendar_period(
    dates: Sequence[str], values: Sequence[float], period: str
) -> tuple[int, int, list[float]] | None:
    if len(dates) != len(values) or not len(dates):
        return None
    end_idx = len(dates) - 1
    start_idx = index_on_or_before_calendar_start(dates, end_idx, period)
    if start_idx is None or start_idx >= end_idx:
        return None
    seg = list(values[start_idx : end_idx + 1])
    return start_idx, end_idx, seg
