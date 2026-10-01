import { spawn } from "node:child_process";
import path from "node:path";
import { NextResponse } from "next/server";

export const maxDuration = 300;

function runScreen(payload: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const root = process.cwd();
    const py = spawn("python3", ["-m", "engine.screen"], {
      cwd: root,
      env: { ...process.env, PYTHONPATH: root },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    py.stdout.on("data", (c) => {
      out += c.toString();
    });
    py.stderr.on("data", (c) => {
      err += c.toString();
    });
    py.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(err || `Python exited ${code}`));
        return;
      }
      resolve(out);
    });
    py.stdin.write(JSON.stringify(payload));
    py.stdin.end();
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const raw = await runScreen(body);
    const data = JSON.parse(raw);
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Screen failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
