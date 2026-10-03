import { listStocks } from "@/lib/engine/market-data-api";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Paginated Nifty Total Market rows with all precomputed Momo-style metrics. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const sort = url.searchParams.get("sort") ?? "sharpe_return_1_year";
  const direction = (url.searchParams.get("direction") ?? "desc") as "asc" | "desc";

  const data = await listStocks({ limit, offset, sort, direction });
  if (!data || data.total === 0) {
    return NextResponse.json(
      {
        error: "Precomputed metrics not in published DB yet.",
        hint:
          "The Blob database may have been overwritten by a CI run without history. " +
          "Republish a full build (npm run build:prices-db && npm run publish:prices) or wait for the fixed daily workflow.",
        total: data?.total ?? 0,
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      limit,
      offset,
      total: data.total,
      sort,
      direction,
      rows: data.rows.map((r) => ({
        symbol: r.symbol,
        as_of_date: r.as_of_date,
        close: r.close,
        close_eod: r.close_eod,
        metrics: r.metrics,
        ...r.extras,
      })),
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
