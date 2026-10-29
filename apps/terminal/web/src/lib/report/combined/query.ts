/* The combined route's query, validated before anything is read: 1–5 distinct uids that look
   like saved files (the store's UID), a format, and the three options as flags. Anything else
   is a 400, with one line on why. */
import { z } from "zod";

import { UID } from "@/lib/data/store";

import { COMBINE_MAX, type CombinedFormat, type CombineOptions } from "./options";

/** "1" or "true" turns an option on; absent, "", "0" and "false" leave it off. */
const flag = z
  .enum(["", "0", "1", "true", "false"])
  .optional()
  .transform((v) => v === "1" || v === "true");

export const CombinedQuerySchema = z.object({
  uids: z
    .string()
    .transform((s) => s.split(",").map((u) => u.trim()).filter(Boolean))
    .pipe(
      z
        .array(z.string().regex(UID, "not an assessment id"))
        .min(1, "pick at least one run")
        .max(COMBINE_MAX, `at most ${COMBINE_MAX} runs can be combined`)
        .refine((list) => new Set(list).size === list.length, "a run is listed twice"),
    ),
  format: z.enum(["preview", "pdf", "docx"]).default("preview"),
  evidence: flag,
  low: flag,
  appendix: flag,
});

export interface CombinedQuery {
  uids: string[];
  format: CombinedFormat;
  options: CombineOptions;
}

/** The query, or the first problem with it. */
export function parseCombinedQuery(params: URLSearchParams): { ok: true; query: CombinedQuery } | { ok: false; error: string } {
  const raw = Object.fromEntries(["uids", "format", "evidence", "low", "appendix"].map((k) => [k, params.get(k) ?? undefined]));
  const parsed = CombinedQuerySchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path.length ? `${String(issue.path[0])}: ` : "";
    return { ok: false, error: `${where}${issue.message}` };
  }
  const { uids, format, evidence, low, appendix } = parsed.data;
  return { ok: true, query: { uids, format, options: { evidence, low, appendix } } };
}
