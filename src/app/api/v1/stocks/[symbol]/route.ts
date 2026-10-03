import { getStock } from "@/lib/engine/market-data-api";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ symbol: string }> };

/** One symbol: full metric map, extras, optional adjusted EOD bars. */
export async function GET(req: Request, { params }: Params) {
  const { symbol } = await params;
  const url = new URL(req.url);
  const bars = Math.min(Number(url.searchParams.get("bars") ?? "0"), 600);

  const row = await getStock(symbol, bars);
  if (!row) {
    return NextResponse.json({ error: `No metrics for symbol ${symbol.toUpperCase()}.` }, { status: 404 });
  }

  const { bars: history, ...rest } = row;
  return NextResponse.json(
    {
      ...rest,
      extras: rest.extras,
      metrics: rest.metrics,
      ...(history?.length ? { bars: history } : {}),
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
