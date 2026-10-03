import { SORT_OPTIONS } from "@/lib/screen-config";
import { loadPriceHistory, type Bar } from "./bhavcopy";
import { loadPriceHistoryFromDb, sharedDbConfigured } from "./price-db";
import { mergeLiveLtp } from "./live-ltp";
import {
  backAdjustBars,
  corpActionsNeedBackAdjust,
  fetchCorporateActions,
  getNseSessionCookie,
} from "./corporate-actions";
import { closesForMetrics, lastDisplayPrice } from "./prices";
import {
  calendarLookbackTradingDays,
  circuitsCalendar,
  computeSortMetric,
  medianVolumeCalendar,
  minTradingDaysForSortKey,
  pctPositiveCalendar,
} from "./metrics";
import { INDEX_LABELS, fetchIndexSymbols } from "./universe";

const REPO = 0.065;
const SORT_KEYS = new Set<string>(SORT_OPTIONS.map((s) => s.value));

export type ScreenInput = {
  index: string;
  sort_by: string;
  sort_direction: "desc" | "asc";
  sort_by_two: string;
  sort_direction_two: "desc" | "asc";
  sort_by_three: string;
  sort_direction_three: "desc" | "asc";
  median_volume: number;
  away_from_high: number;
  away_from_five_year_high: number;
  away_from_all_time_high: number;
  ma_200: "yes" | "no";
  ma_100: "yes" | "no";
  minimum_return_one_year: "none" | "repo";
  annual_return_above_volatility: "yes" | "no";
  percentage_positive_days_one_year: number;
  percentage_positive_days_six_months: number;
  percentage_positive_days_three_months: number;
  exclude_stocks_with_circuits_one_year: number;
  apply_filters_on: "all" | "ranked";
  ignore_top_beta: "yes" | "no";
  series: "all" | "eq";
  limit: number;
  sync_data: boolean;
  apply_corporate_actions?: boolean;
};

function aboveMa(closes: number[], period: number) {
  if (closes.length < period) return null;
  const ma = closes.slice(-period).reduce((a, b) => a + b, 0) / period;
  return closes[closes.length - 1] > ma;
}

function passesFilters(row: Record<string, unknown>, cfg: ScreenInput) {
  if (cfg.median_volume > 0) {
    const mv = row.median_volume as number | null;
    if (mv == null || mv < cfg.median_volume) return false;
  }
  const checks: [number, string][] = [
    [cfg.away_from_high, "away_from_high_1y"],
    [cfg.away_from_five_year_high, "away_from_high_5y"],
    [cfg.away_from_all_time_high, "away_from_high_at"],
  ];
  for (const [minPct, key] of checks) {
    if (minPct <= -99) continue;
    const v = row[key] as number | null;
    if (v == null || v < minPct) return false;
  }
  if (cfg.ma_200 === "yes" && row.above_ma_200 !== true) return false;
  if (cfg.ma_100 === "yes" && row.above_ma_100 !== true) return false;
  if (cfg.minimum_return_one_year === "repo") {
    const roc = row.absolute_return_1y as number | null;
    if (roc == null || roc < REPO) return false;
  }
  if (cfg.annual_return_above_volatility === "yes") {
    const roc = row.absolute_return_1y as number | null;
    const vol = row.volatility_1y as number | null;
    if (roc == null || vol == null || roc <= vol) return false;
  }
  const pctChecks: [number, string][] = [
    [cfg.percentage_positive_days_one_year, "pct_pos_1y"],
    [cfg.percentage_positive_days_six_months, "pct_pos_6m"],
    [cfg.percentage_positive_days_three_months, "pct_pos_3m"],
  ];
  for (const [min, key] of pctChecks) {
    if (min <= 0) continue;
    const v = row[key] as number | null;
    if (v == null || v < min) return false;
  }
  if (cfg.exclude_stocks_with_circuits_one_year > 0) {
    const hits = row.circuit_hits_1y as number;
    if (hits > cfg.exclude_stocks_with_circuits_one_year) return false;
  }
  return true;
}

function requiredLookbackDays(cfg: ScreenInput): number {
  const sortKeys = [cfg.sort_by, cfg.sort_by_two, cfg.sort_by_three].filter(
    (k): k is string => typeof k === "string" && k !== "none",
  );
  let need = sortKeys.reduce((m, k) => Math.max(m, minTradingDaysForSortKey(k)), 35);
  if (cfg.ma_200 === "yes") need = Math.max(need, 200);
  if (cfg.ma_100 === "yes") need = Math.max(need, 100);
  if (
    cfg.minimum_return_one_year === "repo" ||
    cfg.annual_return_above_volatility === "yes" ||
    cfg.percentage_positive_days_one_year > 0 ||
    cfg.exclude_stocks_with_circuits_one_year > 0
  ) {
    need = Math.max(need, calendarLookbackTradingDays("1_year"));
  }
  if (cfg.percentage_positive_days_six_months > 0) {
    need = Math.max(need, calendarLookbackTradingDays("6_months"));
  }
  if (cfg.percentage_positive_days_three_months > 0) {
    need = Math.max(need, calendarLookbackTradingDays("3_months"));
  }
  // Extra slack for holidays / missing bhavcopy files (calendar 1Y ≈ 260 sessions in-window)
  return Math.min(need + 15, 300);
}

function sortTuple(row: Record<string, unknown>, key: string, dir: "asc" | "desc"): [number, number] {
  if (key === "none" || !SORT_KEYS.has(key)) return [1, 0];
  const v = (row.metrics as Record<string, number | null>)[key];
  if (v == null || Number.isNaN(v)) return [1, 0];
  const lowerBetter = key === "volatility_1_year" || key === "price_to_earnings";
  let score = v;
  if (dir === "desc") score = lowerBetter ? v : -v;
  else score = lowerBetter ? -v : v;
  return [0, score];
}

export async function runScreen(cfg: ScreenInput) {
  if (!SORT_KEYS.has(cfg.sort_by)) {
    return { error: `Invalid sort_by: ${cfg.sort_by}` };
  }

  const lookback = requiredLookbackDays(cfg);
  const symbols = await fetchIndexSymbols(cfg.index);
  if (!symbols.length) return { error: "Empty universe" };

  const seriesMode = cfg.series === "eq" ? "eq" : "all";
  const fromDb = sharedDbConfigured() ? await loadPriceHistoryFromDb(symbols, lookback, seriesMode) : null;
  const { bySymbol, fetchedDays, asOf } = fromDb ?? (await loadPriceHistory(symbols, lookback, seriesMode));
  const usingSharedDb = !!fromDb;
  const sharedManifest = fromDb?.manifest;

  let liveLtp: { updated: number; liveAsOf: string | null } | undefined;
  const todayIst = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const needsLiveLtp = cfg.sync_data && (!asOf || asOf < todayIst);
  if (needsLiveLtp) {
    const cap = process.env.VERCEL ? 80 : symbols.length;
    liveLtp = await mergeLiveLtp(bySymbol, symbols.slice(0, cap));
  }

  const benchSyms = (await fetchIndexSymbols("is_nifty_50")).slice(0, 20);
  let benchCloses: number[] = [];
  const benchBars = benchSyms.map((s) => bySymbol.get(s) || []).filter((b) => b.length > 30);
  if (benchBars.length) {
    const minLen = Math.min(...benchBars.map((b) => b.length));
    const benchSlices = benchBars.map((b) => closesForMetrics(b).slice(-minLen));
    benchCloses = Array.from(
      { length: minLen },
      (_, i) => benchSlices.reduce((sum, s) => sum + s[i], 0) / benchSlices.length,
    );
  }

  const applyCa = !usingSharedDb && cfg.apply_corporate_actions !== false;

  function buildRow(sym: string, bars: Bar[], caNotes: string[] = []) {
    const dates = bars.map((b) => b.date);
    const closes = closesForMetrics(bars);
    const highs = bars.map((b) => b.high);
    const display = lastDisplayPrice(bars);
    const volumes = bars.map((b) => b.volume);

    const metrics: Record<string, number | null> = {};
    for (const k of SORT_KEYS) {
      metrics[k] = computeSortMetric(k, closes, highs, benchCloses, dates);
    }

    rows.push({
      symbol: sym,
      close: display.ltp,
      close_eod: display.close,
      metrics,
      median_volume: medianVolumeCalendar(volumes, dates, "1_year"),
      away_from_high_1y: metrics.away_from_high_1_year,
      away_from_high_at: metrics.away_from_high_all_time,
      away_from_high_5y: metrics.away_from_high_all_time,
      above_ma_200: aboveMa(closes, 200),
      above_ma_100: aboveMa(closes, 100),
      absolute_return_1y: metrics.absolute_return_1_year,
      volatility_1y: metrics.volatility_1_year,
      pct_pos_1y: pctPositiveCalendar(closes, dates, "1_year"),
      pct_pos_6m: pctPositiveCalendar(closes, dates, "6_months"),
      pct_pos_3m: pctPositiveCalendar(closes, dates, "3_months"),
      circuit_hits_1y: circuitsCalendar(closes, dates, "1_year"),
      beta: metrics.beta,
      ca_notes: caNotes.length ? caNotes : undefined,
    });
  }

  let caSkipped = 0;
  let caAdjusted = 0;
  const adjustedBySymbol = new Map<string, { bars: Bar[]; notes: string[] }>();

  if (applyCa) {
    const caCandidates = symbols.filter((sym) => {
      const bars = bySymbol.get(sym);
      return bars && bars.length >= 30;
    });
    let nseCookie: string | undefined;
    try {
      nseCookie = await getNseSessionCookie();
    } catch {
      nseCookie = undefined;
    }
    const caDeadline = Date.now() + (process.env.VERCEL ? 25_000 : 120_000);
    const caConcurrency = process.env.VERCEL ? 8 : 12;
    for (let i = 0; i < caCandidates.length; i += caConcurrency) {
      if (Date.now() > caDeadline) {
        caSkipped += caCandidates.length - i;
        break;
      }
      await Promise.all(
        caCandidates.slice(i, i + caConcurrency).map(async (sym) => {
          const raw = bySymbol.get(sym);
          if (!raw) return;
          const actions = await fetchCorporateActions(sym, nseCookie);
          const lastDate = raw[raw.length - 1].date;
          if (!corpActionsNeedBackAdjust(actions, lastDate)) return;
          const { bars: adj, notes } = backAdjustBars(raw, actions);
          if (notes.length) {
            adjustedBySymbol.set(sym, { bars: adj, notes });
            caAdjusted++;
          }
        }),
      );
    }
  }

  let rows: Record<string, unknown>[] = [];
  for (const sym of symbols) {
    const adj = adjustedBySymbol.get(sym);
    const bars = adj?.bars ?? bySymbol.get(sym);
    if (!bars || bars.length < 30) continue;
    buildRow(sym, bars, adj?.notes ?? []);
  }

  if (cfg.ignore_top_beta === "yes") {
    const betas = rows.map((r) => r.beta as number | null).filter((b): b is number => b != null);
    if (betas.length) {
      betas.sort((a, b) => a - b);
      const cutoff = betas[Math.floor(betas.length * 0.9)] ?? betas[betas.length - 1];
      rows = rows.filter((r) => {
        const b = r.beta as number | null;
        return b == null || b <= cutoff;
      });
    }
  }

  if (cfg.apply_filters_on === "all") {
    rows = rows.filter((r) => passesFilters(r, cfg));
  }

  rows.sort((a, b) => {
    const keys: [string, "asc" | "desc"][] = [[cfg.sort_by, cfg.sort_direction]];
    if (cfg.sort_by_two !== "none") keys.push([cfg.sort_by_two, cfg.sort_direction_two]);
    if (cfg.sort_by_three !== "none") keys.push([cfg.sort_by_three, cfg.sort_direction_three]);
    for (const [k, d] of keys) {
      const ta = sortTuple(a, k, d);
      const tb = sortTuple(b, k, d);
      if (ta[0] !== tb[0] || ta[1] !== tb[1]) {
        return ta[0] - tb[0] || ta[1] - tb[1];
      }
    }
    return String(a.symbol).localeCompare(String(b.symbol));
  });

  if (cfg.apply_filters_on === "ranked") {
    rows = rows.filter((r) => passesFilters(r, cfg));
  }

  const out = rows.slice(0, cfg.limit).map((r, i) => ({
    rank: i + 1,
    symbol: r.symbol,
    close: r.close,
    close_eod: r.close_eod,
    primary: (r.metrics as Record<string, number | null>)[cfg.sort_by],
  }));

  const fetchDepth = minTradingDaysForSortKey(cfg.sort_by);
  const withPrimary = rows.filter((r) => {
    const v = (r.metrics as Record<string, number | null>)[cfg.sort_by];
    return v != null && !Number.isNaN(v);
  }).length;
  const evaluatedCount = rows.length;
  // Calendar 1Y needs ~260 in-window sessions; fetchDepth (280) is bhavcopy depth, not bar count required.
  const fetchShortfall = fetchDepth > 0 && fetchedDays > 0 && fetchedDays < fetchDepth - 12;
  let warning: string | undefined;
  if (fetchDepth > 1 && withPrimary === 0) {
    warning =
      `Could not compute “${cfg.sort_by}” for any stock (loaded ${fetchedDays} bhavcopy days; target ~${lookback}). ` +
      "Results are not ranked by your sort factor. Try a shorter window (e.g. 3M/6M Sharpe) or run locally for full history.";
  } else if (fetchShortfall && withPrimary < evaluatedCount * 0.9) {
    warning =
      `Only ${fetchedDays} of ~${lookback} NSE bhavcopy days returned data (holidays or failed downloads). ` +
      `Some names may be missing “${cfg.sort_by}”.`;
  }
  if (caSkipped > 0) {
    const caMsg =
      `Corporate-action back-adjust skipped for ${caSkipped} names (server time budget). ` +
      "Disable “Apply corporate actions” in Core for a faster run, or use local dev for a full CA pass.";
    warning = warning ? `${warning} ${caMsg}` : caMsg;
  }

  return {
    index: cfg.index,
    index_label: INDEX_LABELS[cfg.index] || cfg.index,
    as_of: asOf,
    universe_count: symbols.length,
    evaluated: rows.length,
    ranked_with_primary: withPrimary,
    sync: {
      fetched_days: fetchedDays,
      lookback_requested: lookback,
      vercel_mode: !!process.env.VERCEL,
      price_source: usingSharedDb ? "shared_db" : "live_bhavcopy",
      shared_db_built_at: sharedManifest?.built_at,
      shared_db_manifest: sharedManifest?.manifest_url || process.env.PRICES_MANIFEST_URL,
      live_ltp_updated: liveLtp?.updated,
      live_ltp_as_of: liveLtp?.liveAsOf ?? undefined,
      corporate_actions_adjusted: caAdjusted > 0 ? caAdjusted : undefined,
      corporate_actions_skipped: caSkipped > 0 ? caSkipped : undefined,
    },
    warning,
    rows: out,
  };
}
