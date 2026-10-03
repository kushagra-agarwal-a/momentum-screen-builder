import type Database from "better-sqlite3";
import { ensureLocalPricesDb } from "./price-db";

export type StockMetricsRow = {
  symbol: string;
  as_of_date: string;
  computed_at: string;
  close: number | null;
  close_eod: number | null;
  metrics: Record<string, number | null>;
  extras: Record<string, unknown>;
};

export type MarketMeta = {
  as_of_date: string | null;
  metrics_computed_at: string | null;
  pipeline_daily_at: string | null;
  symbol_count: number;
  manifest_url?: string;
  download_url?: string;
};

async function openDb(): Promise<Database.Database | null> {
  const ready = await ensureLocalPricesDb();
  if (!ready) return null;
  const { default: Database } = await import("better-sqlite3");
  return new Database(ready.path, { readonly: true, fileMustExist: true });
}

function hasMetricsTable(database: Database.Database): boolean {
  const row = database
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='symbol_metrics'")
    .get();
  return !!row;
}

export async function getMarketMeta(): Promise<MarketMeta | null> {
  const database = await openDb();
  if (!database) return null;
  try {
    if (!hasMetricsTable(database)) {
      database.close();
      return null;
    }
    const agg = database
      .prepare("SELECT MAX(as_of_date) AS d, MAX(computed_at) AS c, COUNT(*) AS n FROM symbol_metrics")
      .get() as { d: string | null; c: string | null; n: number };
    const pipe = database.prepare("SELECT value FROM build_meta WHERE key = 'pipeline_daily'").get() as
      | { value: string }
      | undefined;
    let pipeline_daily_at: string | null = null;
    if (pipe?.value) {
      try {
        pipeline_daily_at = (JSON.parse(pipe.value) as { finished_at?: string }).finished_at ?? null;
      } catch {
        pipeline_daily_at = null;
      }
    }
    return {
      as_of_date: agg.d,
      metrics_computed_at: agg.c,
      pipeline_daily_at,
      symbol_count: agg.n,
    };
  } finally {
    database.close();
  }
}

export async function listStocks(options: {
  limit?: number;
  offset?: number;
  sort?: string;
  direction?: "asc" | "desc";
}): Promise<{ rows: StockMetricsRow[]; total: number } | null> {
  const database = await openDb();
  if (!database || !hasMetricsTable(database)) {
    database?.close();
    return null;
  }
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
  const offset = Math.max(options.offset ?? 0, 0);
  const sort = options.sort ?? "sharpe_return_1_year";
  const direction = options.direction ?? "desc";

  const totalRow = database.prepare("SELECT COUNT(*) AS n FROM symbol_metrics").get() as { n: number };

  const all = database
    .prepare(
      `SELECT symbol, as_of_date, computed_at, close, close_eod, metrics_json, extras_json FROM symbol_metrics`,
    )
    .all() as Array<{
    symbol: string;
    as_of_date: string;
    computed_at: string;
    close: number | null;
    close_eod: number | null;
    metrics_json: string;
    extras_json: string;
  }>;

  const parsed: StockMetricsRow[] = all.map((r) => ({
    symbol: r.symbol,
    as_of_date: r.as_of_date,
    computed_at: r.computed_at,
    close: r.close,
    close_eod: r.close_eod,
    metrics: JSON.parse(r.metrics_json) as Record<string, number | null>,
    extras: JSON.parse(r.extras_json) as Record<string, unknown>,
  }));

  const lowerBetter = sort === "volatility_1_year" || sort === "price_to_earnings";
  parsed.sort((a, b) => {
    const va = a.metrics[sort];
    const vb = b.metrics[sort];
    if (va == null && vb == null) return a.symbol.localeCompare(b.symbol);
    if (va == null) return 1;
    if (vb == null) return -1;
    const cmp = va - vb;
    if (direction === "desc") return lowerBetter ? cmp : -cmp;
    return lowerBetter ? -cmp : cmp;
  });

  database.close();
  return { rows: parsed.slice(offset, offset + limit), total: totalRow.n };
}

export async function getStock(symbol: string, barsLimit = 0): Promise<
  | (StockMetricsRow & {
      bars?: Array<{ date: string; close: number; ltp: number; high: number; volume: number }>;
    })
  | null
> {
  const database = await openDb();
  if (!database || !hasMetricsTable(database)) {
    database?.close();
    return null;
  }
  const sym = symbol.toUpperCase();
  const row = database
    .prepare(
      `SELECT symbol, as_of_date, computed_at, close, close_eod, metrics_json, extras_json
       FROM symbol_metrics WHERE symbol = ?`,
    )
    .get(sym) as
    | {
        symbol: string;
        as_of_date: string;
        computed_at: string;
        close: number | null;
        close_eod: number | null;
        metrics_json: string;
        extras_json: string;
      }
    | undefined;

  if (!row) {
    database.close();
    return null;
  }

  const out: StockMetricsRow & {
    bars?: Array<{ date: string; close: number; ltp: number; high: number; volume: number }>;
  } = {
    symbol: row.symbol,
    as_of_date: row.as_of_date,
    computed_at: row.computed_at,
    close: row.close,
    close_eod: row.close_eod,
    metrics: JSON.parse(row.metrics_json) as Record<string, number | null>,
    extras: JSON.parse(row.extras_json) as Record<string, unknown>,
  };

  if (barsLimit > 0) {
    const bars = database
      .prepare(
        `SELECT trade_date, close, ltp, high, volume FROM eod_adjusted
         WHERE symbol = ? ORDER BY trade_date DESC LIMIT ?`,
      )
      .all(sym, barsLimit) as Array<{
      trade_date: string;
      close: number;
      ltp: number | null;
      high: number | null;
      volume: number | null;
    }>;
    out.bars = bars
      .map((b) => ({
        date: b.trade_date,
        close: b.close,
        ltp: b.ltp ?? b.close,
        high: b.high ?? b.close,
        volume: b.volume ?? 0,
      }))
      .reverse();
  }

  database.close();
  return out;
}
