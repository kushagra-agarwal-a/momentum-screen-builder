from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import requests

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

MONTHS = {
    "Jan": "01",
    "Feb": "02",
    "Mar": "03",
    "Apr": "04",
    "May": "05",
    "Jun": "06",
    "Jul": "07",
    "Aug": "08",
    "Sep": "09",
    "Oct": "10",
    "Nov": "11",
    "Dec": "12",
}


@dataclass
class CorpAction:
    ex_date: str
    subject: str
    series: str = "EQ"


def parse_ex_date(s: str) -> str | None:
    m = re.match(r"^(\d{1,2})-([A-Za-z]{3})-(\d{4})$", s.strip())
    if not m:
        return None
    mm = MONTHS.get(m.group(2))
    if not mm:
        return None
    return f"{m.group(3)}-{mm}-{m.group(1).zfill(2)}"


def classify_subject(subject: str) -> str:
    s = subject.strip()
    lower = s.lower()
    if re.search(r"right\s*issue|^rights\b", s, re.I):
        return "rights"
    if re.search(r"buy\s*back|buyback", lower):
        return "buyback"
    if re.search(r"merger|amalgamation|scheme of arrangement|demerger|spin[- ]?off", lower):
        return "scheme_merger_demerger"
    if re.search(r"face value|sub-division|sub division|stock split|split from", lower):
        return "split"
    if re.search(r"capital reduction|consolidation|reverse split", lower):
        return "consolidation"
    if re.search(r"bonus", lower):
        return "bonus"
    if re.search(r"dividend|int\.?\s*div|interim div", lower):
        return "dividend"
    if re.search(
        r"annual general meeting|extraordinary general|postal ballot|book closure|meeting of equity",
        lower,
    ):
        return "administrative"
    return "other"


def is_structural(t: str) -> bool:
    return t in ("bonus", "split", "consolidation", "scheme_merger_demerger", "rights")


def nse_session_cookie(session: requests.Session) -> str:
    session.get("https://www.nseindia.com/", headers={"User-Agent": UA}, timeout=30)
    return "; ".join(f"{c.name}={c.value}" for c in session.cookies)


def fetch_corporate_actions(symbol: str, session: requests.Session | None = None) -> list[CorpAction]:
    sess = session or requests.Session()
    cookie = nse_session_cookie(sess)
    url = f"https://www.nseindia.com/api/corporates-corporateActions?index=equities&symbol={symbol}"
    res = sess.get(
        url,
        headers={"User-Agent": UA, "Accept": "application/json", "Referer": "https://www.nseindia.com/", "Cookie": cookie},
        timeout=30,
    )
    if not res.ok:
        return []
    raw: list[dict[str, Any]] = res.json()
    out: list[CorpAction] = []
    for row in raw:
        ex = parse_ex_date(str(row.get("exDate", "")))
        if ex:
            out.append(
                CorpAction(
                    ex_date=ex,
                    subject=str(row.get("subject", "")),
                    series=str(row.get("series") or "EQ"),
                )
            )
    out.sort(key=lambda a: a.ex_date)
    return out


def bonus_factor(subject: str) -> float | None:
    if not re.search(r"bon", subject, re.I):
        return None
    m = re.search(r"(\d+)\s*:\s*(\d+)", subject)
    if not m:
        return None
    a, b = int(m.group(1)), int(m.group(2))
    if not a or not b:
        return None
    return b / (a + b)


def split_factor(subject: str) -> float | None:
    m = re.search(
        r"from\s*rs\.?\s*([\d.]+)[\s/-]*(?:per share)?\s*to\s*(?:re\.?|rs\.?\s*)?\s*([\d.]+)",
        subject,
        re.I,
    )
    if m:
        old_f, new_f = float(m.group(1)), float(m.group(2))
        if old_f > 0 and new_f > 0:
            return new_f / old_f
    return None


def ratio_at_ex(bars: list[dict[str, Any]], ex_iso: str) -> float | None:
    idx = next((i for i, b in enumerate(bars) if b["trade_date"] == ex_iso), -1)
    if idx <= 0:
        return None
    pre, post = float(bars[idx - 1]["close"]), float(bars[idx]["close"])
    if not pre or not post:
        return None
    return post / pre


def corp_actions_need_adjust(actions: list[CorpAction], last_bar: str) -> bool:
    for a in actions:
        if a.ex_date > last_bar:
            continue
        if is_structural(classify_subject(a.subject)):
            return True
    return False


def back_adjust_bars(bars: list[dict[str, Any]], actions: list[CorpAction]) -> tuple[list[dict[str, Any]], list[str]]:
    if not bars or not actions:
        return bars, []
    out = [dict(b) for b in sorted(bars, key=lambda x: x["trade_date"])]
    notes: list[str] = []
    for act in sorted(actions, key=lambda a: a.ex_date):
        t = classify_subject(act.subject)
        if not is_structural(t):
            continue
        factor: float | None = None
        if t == "bonus":
            factor = bonus_factor(act.subject)
        elif t == "split":
            factor = split_factor(act.subject) or ratio_at_ex(out, act.ex_date)
        elif t in ("consolidation", "scheme_merger_demerger", "rights"):
            factor = ratio_at_ex(out, act.ex_date)
        if factor is None or factor <= 0:
            continue
        notes.append(f"{t} {act.ex_date} x{factor:.4f}")
        for b in out:
            if b["trade_date"] < act.ex_date:
                for col in ("close", "ltp", "high"):
                    b[col] = float(b[col]) * factor
    return out, notes
