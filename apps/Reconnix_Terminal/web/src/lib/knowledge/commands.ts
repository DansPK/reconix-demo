/* The CLI's three commands as the routes use them (server only): each run (cli.ts) turned into a
   result the route can answer with. Exit 0 with the expected output is done; exit 2 is a refusal
   whose message (one line, cleaned, cut) goes to the operator; anything else (exit 1, a crash, a
   timeout, output past its cap or not as agreed) is a fixed message, so nothing the process
   printed by accident reaches the page. */
import "server-only";

import { z } from "zod";

import { clean } from "../assistant/context";
import { IndexEntrySchema } from "../assistant/knowledge/schema";
import { type CliRun, MAX_ORIGINAL_OUTPUT, runCli } from "./cli";
import { toItem } from "./list";
import type { KnowledgeItem } from "./types";

export const FAILED = "The knowledge tool failed. Try again; if it keeps failing, add the file with /add-on in the terminal.";
export const NOT_STARTED = "The knowledge tool could not start. Start the dashboard with RECONIX_PYTHON set to the Python that runs Reconix.";
export const TIMED_OUT = "The knowledge tool took too long and was stopped. Try again.";
const MAX_ERROR = 300;

export type Outcome<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

const RefusalSchema = z.object({ ok: z.literal(false), error: z.string().min(1).max(4000) });
// the index entry's fields, checked as strictly, but a note the CLI may add beside them (say, that
// a cap cut the file short) is dropped rather than turning a done upload into a failure
const AddedSchema = z.object({ ok: z.literal(true), source: z.object(IndexEntrySchema.shape) });
const DoneSchema = z.object({ ok: z.literal(true) });

const json = (text: Buffer | string): unknown => {
  try {
    return JSON.parse(text.toString());
  } catch {
    return null;
  }
};

/** A refusal's message as the page may show it, or null. */
function refusal(printed: Buffer | string): string | null {
  const parsed = RefusalSchema.safeParse(json(printed));
  return parsed.success ? clean(parsed.data.error, MAX_ERROR) || null : null;
}

/** The fixed message for a run that went wrong (anything but a clean exit 0 or 2). */
function broken(run: CliRun): Outcome<never> {
  if (!run.started) return { ok: false, status: 500, error: NOT_STARTED };
  if (run.timedOut) return { ok: false, status: 500, error: TIMED_OUT };
  return { ok: false, status: 500, error: FAILED };
}

/** Exit 2 → `status` with the CLI's message (or the fixed one when it printed none). */
const refused = (message: string | null, status: number): Outcome<never> => ({ ok: false, status, error: message ?? FAILED });

/** Adds the uploaded file at `file` (a private temp file) as `name`, from the web. */
export async function addSource(file: string, name: string): Promise<Outcome<KnowledgeItem>> {
  const run = await runCli(["add", "--file", file, "--name", name, "--source", "web"]);
  if (run.timedOut || run.overflow || !run.started) return broken(run);
  if (run.code === 2) return refused(refusal(run.stdout), 400);
  if (run.code !== 0) return broken(run);
  const parsed = AddedSchema.safeParse(json(run.stdout));
  return parsed.success ? { ok: true, value: toItem(parsed.data.source) } : broken(run);
}

/** The original's bytes. A refusal (no such file, no original kept) is 404. */
export async function readOriginal(id: string): Promise<Outcome<Buffer>> {
  const run = await runCli(["original", id], { maxStdout: MAX_ORIGINAL_OUTPUT });
  if (run.timedOut || run.overflow || !run.started) return broken(run);
  if (run.code === 2) return refused(refusal(run.stderr), 404);
  return run.code === 0 ? { ok: true, value: run.stdout } : broken(run);
}

/** Removes a file: its index entry, passages and original. */
export async function removeSource(id: string): Promise<Outcome<true>> {
  const run = await runCli(["remove", id]);
  if (run.timedOut || run.overflow || !run.started) return broken(run);
  if (run.code === 2) return refused(refusal(run.stdout), 400);
  if (run.code !== 0) return broken(run);
  return DoneSchema.safeParse(json(run.stdout)).success ? { ok: true, value: true } : broken(run);
}
