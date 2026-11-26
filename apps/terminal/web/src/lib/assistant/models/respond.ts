/* The model picker's routes' shared reading (server only): a body read within its byte cap and checked against its strict shape. */
import "server-only";

import type { NextResponse } from "next/server";
import type { z } from "zod";

import { fail, readJson } from "../access";
import { MAX_MODELS_BODY } from "./requests";

/** The body, parsed by `schema`: too big 413, not JSON or the wrong shape 400. */
export async function readBody<T>(request: Request, schema: z.ZodType<T>, wrong: string): Promise<{ ok: true; value: T } | { ok: false; response: NextResponse }> {
  const body = await readJson(request, MAX_MODELS_BODY);
  if (!body.ok) return body;
  const parsed = schema.safeParse(body.value);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, response: fail(wrong, 400) };
}
