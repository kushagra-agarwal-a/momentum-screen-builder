import { runScreen, type ScreenInput } from "@/lib/engine/run-screen";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ScreenInput;
    const data = await runScreen(body);
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Screen failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
