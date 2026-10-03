import Database from "better-sqlite3";
import { createGunzip } from "node:zlib";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { Bar, SeriesMode } from "./bhavcopy";

export type PricesManifest = {
  version: number;
  universe: string;
  description: string;
  built_at: string;
  sha256: string;
  size_bytes: number;
  gzip_size_bytes?: number;
  download_url: string;
  manifest_url?: string;
  format: string;
  tables?: string[];
};

const DEFAULT_MANIFEST_URL = process.env.PRICES_MANIFEST_URL || "";

let manifestCache: { at: number; manifest: PricesManifest } | null = null;
let dbOpen: Database.Database | null = null;
let dbPathReady: string | null = null;

function cacheDir() {
  const base = process.env.PRICES_DB_CACHE_DIR || path.join("/tmp", "momo-prices-db");
  mkdirSync(base, { recursive: true });
  return base;
}

export async function fetchManifest(url = DEFAULT_MANIFEST_URL): Promise<PricesManifest | null> {
  if (!url) return null;
  const now = Date.now();
  if (manifestCache && now - manifestCache.at < 15_000) return manifestCache.manifest;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const manifest = (await res.json()) as PricesManifest;
    if (!manifest.download_url || !manifest.sha256) return null;
    manifestCache = { at: now, manifest };
    return manifest;
  } catch {
    return null;
  }
}

async function downloadToFile(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

async function gunzipFile(src: string, dest: string) {
  await pipeline(createReadStream(src), createGunzip(), createWriteStream(dest));
}

function sha256File(p: string) {
  const h = createHash("sha256");
  h.update(readFileSync(p));
  return h.digest("hex");
}

/** Ensure local SQLite copy matches manifest; returns path or null if unavailable. */
export async function ensureLocalPricesDb(): Promise<{ path: string; manifest: PricesManifest } | null> {
  const manifestUrl = process.env.PRICES_MANIFEST_URL || DEFAULT_MANIFEST_URL;
  if (process.env.USE_SHARED_PRICES_DB === "0") return null;

  const manifest = await fetchManifest(manifestUrl);
  if (!manifest) return null;

  const dir = cacheDir();
  const markerPath = path.join(dir, "manifest.json");
  const dbPath = path.join(dir, "prices.sqlite");
  const gzPath = path.join(dir, "prices.sqlite.gz");

  let cachedManifest: PricesManifest | null = null;
  if (existsSync(markerPath)) {
    try {
      cachedManifest = JSON.parse(await readFile(markerPath, "utf8")) as PricesManifest;
    } catch {
      cachedManifest = null;
    }
  }

  const needDownload =
    !existsSync(dbPath) ||
    !cachedManifest ||
    cachedManifest.sha256 !== manifest.sha256 ||
    cachedManifest.built_at !== manifest.built_at;

  if (needDownload) {
    await mkdir(dir, { recursive: true });
    const url = manifest.download_url;
    if (url.endsWith(".gz")) {
      await downloadToFile(url, gzPath);
      await gunzipFile(gzPath, dbPath);
    } else {
      await downloadToFile(url, dbPath);
    }
    const got = sha256File(dbPath);
    if (got !== manifest.sha256) {
      throw new Error(`Prices DB sha256 mismatch (expected ${manifest.sha256}, got ${got})`);
    }
    await writeFile(markerPath, JSON.stringify(manifest, null, 2));
  }

  if (dbOpen && dbPathReady === dbPath) {
    return { path: dbPath, manifest };
  }

  if (dbOpen) {
    dbOpen.close();
    dbOpen = null;
  }

  dbOpen = new Database(dbPath, { readonly: true, fileMustExist: true });
  dbPathReady = dbPath;
  return { path: dbPath, manifest };
}

function seriesFilter(mode: SeriesMode) {
  return mode === "eq" ? "AND (series IS NULL OR series = 'EQ')" : "AND (series IS NULL OR series IN ('EQ','BE'))";
}

/** Load CA-adjusted history from shared SQLite (eod_adjusted). */
export async function loadPriceHistoryFromDb(
  symbols: string[],
  lookbackDays: number,
  seriesMode: SeriesMode = "all",
): Promise<{
  bySymbol: Map<string, Bar[]>;
  fetchedDays: number;
  asOf: string | null;
  source: "shared_db";
  manifest?: PricesManifest;
} | null> {
  const ready = await ensureLocalPricesDb();
  if (!ready) return null;

  const db = dbOpen!;
  const hasAdjusted = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='eod_adjusted'")
    .get();
  const table = hasAdjusted ? "eod_adjusted" : "eod_raw";

  const maxRow = db.prepare(`SELECT MAX(trade_date) AS d FROM ${table}`).get() as { d: string | null };
  if (!maxRow?.d) return null;

  const ser = seriesFilter(seriesMode);
  const placeholders = symbols.map(() => "?").join(",");
  const minDateRow = db
    .prepare(
      `SELECT trade_date AS d FROM (
         SELECT DISTINCT trade_date FROM ${table} ORDER BY trade_date DESC LIMIT ?
       ) ORDER BY trade_date ASC LIMIT 1`,
    )
    .get(lookbackDays) as { d: string } | undefined;

  const minDate = minDateRow?.d ?? null;
  const stmt = db.prepare(
    `SELECT trade_date, symbol, close, ltp, high, volume, series
     FROM ${table}
     WHERE symbol IN (${placeholders}) ${ser}
     AND (? IS NULL OR trade_date >= ?)
     ORDER BY symbol, trade_date`,
  );

  const rows = stmt.all(...symbols, minDate, minDate) as Array<{
    trade_date: string;
    symbol: string;
    close: number;
    ltp: number | null;
    high: number | null;
    volume: number | null;
    series: string | null;
  }>;

  const bySymbol = new Map<string, Bar[]>();
  for (const s of symbols) bySymbol.set(s, []);

  const daySet = new Set<string>();
  let asOf: string | null = null;

  for (const r of rows) {
    const bar: Bar = {
      date: r.trade_date,
      close: r.close,
      ltp: r.ltp ?? r.close,
      high: r.high ?? r.close,
      volume: r.volume ?? 0,
      series: r.series ?? undefined,
    };
    bySymbol.get(r.symbol)!.push(bar);
    daySet.add(r.trade_date);
    asOf = r.trade_date;
  }

  return {
    bySymbol,
    fetchedDays: daySet.size,
    asOf,
    source: "shared_db",
    manifest: ready.manifest,
  };
}

export function sharedDbConfigured(): boolean {
  return process.env.USE_SHARED_PRICES_DB !== "0" && !!process.env.PRICES_MANIFEST_URL;
}
