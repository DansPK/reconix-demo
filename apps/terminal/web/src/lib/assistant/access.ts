/* Request helpers for the AI Assistant routes. Static demo: there is no sign-in, so `refuse`
   always lets the request through; only the body-size helpers below do any gating. Server only. */
import "server-only";

import { NextResponse } from "next/server";

export const NO_STORE = { "Cache-Control": "no-store" };

export const fail = (detail: string, status: number) => NextResponse.json({ detail }, { status, headers: NO_STORE });

/** Kept for the routes that call it; the demo has no auth, so nothing is refused. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function refuse(request: Request, opts: { change: boolean }): Promise<NextResponse | null> {
  return null;
}

/** The body's bytes, or null once they pass `max` (a missing Content-Length can't hide it: the
    stream is counted as it is read, and dropped at the first byte too many). */
export async function readBytes(request: Request, max: number): Promise<Buffer | null> {
  if (Number(request.headers.get("content-length") ?? 0) > max) return null;
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** The body as text, or null once it passes `max` bytes (readBytes). */
export async function readBody(request: Request, max: number): Promise<string | null> {
  const bytes = await readBytes(request, max);
  return bytes === null ? null : bytes.toString("utf8");
}

/** The body as JSON, or a refusal (too big: 413, not JSON: 400). */
export async function readJson(request: Request, max: number): Promise<{ ok: true; value: unknown } | { ok: false; response: NextResponse }> {
  const text = await readBody(request, max);
  if (text === null) return { ok: false, response: fail("The request is too large.", 413) };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: fail("The request is not valid JSON.", 400) };
  }
}
