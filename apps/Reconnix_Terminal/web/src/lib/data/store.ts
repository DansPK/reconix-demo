/* Reading the saved assessments (server only).

   The TUI writes one JSON file per assessment to RECONIX_DATA_DIR (default
   ~/.reconix/assessments). This module is the dashboard's only data source: it reads
   regular files with the expected name, size-limits and validates each one, and never
   writes anything. Each file is opened without following symlinks and checked through the
   open handle (a regular file, at most 5 MB), so a swapped-in FIFO or device can't hang or
   flood it. An unfinished run whose file has not changed for RECONIX_STALE_AFTER_HOURS
   (default 12; 0 turns it off) reads as interrupted (`markIdle`). Loading requires the viewer role (a second lock behind src/proxy.ts) and calls
   `connection()`, so pages render per request and always show the latest files. */
import "server-only";

import { constants, open, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { connection } from "next/server";
import { cache } from "react";

import { requireSignedIn } from "../auth/guard";
import { type Assessment, AssessmentSchema } from "./schema";
import { markIdle, STALE_AFTER_HOURS } from "./stats";

export const FILE_NAME = /^\d{8}-\d{6}-[0-9a-f]{4}_[A-Za-z0-9-]{1,64}\.json$/;
export const UID = /^\d{8}-\d{6}-[0-9a-f]{4}_[A-Za-z0-9-]{1,64}$/;
const MAX_BYTES = 5_000_000;
const MAX_FILES = 1_000; // newest first; older ones are reported, not read
const OPEN_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

export interface Problem {
  file: string;
  reason: string;
}

export interface Library {
  dir: string;
  readAt: number; // when the folder was read (epoch ms), for the "updated" label
  assessments: Assessment[];
  problems: Problem[];
}

export function dataDir(): string {
  const configured = process.env.RECONIX_DATA_DIR?.trim();
  if (!configured) return path.join(homedir(), ".reconix", "assessments");
  const expanded = configured.startsWith("~/") ? path.join(homedir(), configured.slice(2)) : configured;
  return path.resolve(expanded);
}

/** How long an unfinished run may go without a save before it reads as interrupted (0: never). */
export function staleAfterMs(): number {
  const configured = process.env.RECONIX_STALE_AFTER_HOURS?.trim();
  const hours = configured ? Number(configured) : NaN;
  return (Number.isFinite(hours) && hours >= 0 ? hours : STALE_AFTER_HOURS) * 3_600_000;
}

/** The file's text, read through one handle that never follows a symlink, or why not. */
async function readCapped(full: string): Promise<string | { reason: string }> {
  const handle = await open(/*turbopackIgnore: true*/ full, OPEN_FLAGS);
  try {
    const info = await handle.stat();
    if (!info.isFile()) return { reason: "not a regular file" };
    if (info.size > MAX_BYTES) return { reason: "larger than 5 MB" };
    const buffer = Buffer.alloc(info.size + 1);
    let filled = 0;
    while (filled < buffer.length) {
      const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, filled);
      if (!bytesRead) break;
      filled += bytesRead;
    }
    if (filled > info.size) return { reason: "changed while being read" };
    return buffer.subarray(0, filled).toString("utf8");
  } finally {
    await handle.close();
  }
}

/** Read and validate one file; returns the assessment, why it was skipped, or null when
    the file vanished between listing and reading (the TUI replaces files atomically). */
export async function readAssessmentFile(dir: string, name: string): Promise<Assessment | Problem | null> {
  if (!FILE_NAME.test(name)) return { file: name, reason: "unexpected file name" };
  const full = path.join(dir, name);
  let raw: string;
  try {
    const read = await readCapped(full);
    if (typeof read !== "string") return { file: name, reason: read.reason };
    raw = read;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    if (code === "ELOOP" || code === "EMLINK") return { file: name, reason: "not a regular file" };
    return { file: name, reason: "could not be read" };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { file: name, reason: "is not valid JSON" };
  }
  const parsed = AssessmentSchema.safeParse(json);
  if (!parsed.success) return { file: name, reason: "does not match the expected format" };
  if (`${parsed.data.uid}.json` !== name) return { file: name, reason: "name does not match its contents" };
  return parsed.data;
}

export const loadLibrary = cache(async (): Promise<Library> => {
  await requireSignedIn();
  await connection();
  const dir = dataDir();
  let names: string[];
  try {
    names = await readdir(/*turbopackIgnore: true*/ dir); // outside the project, on purpose
  } catch {
    return { dir, readAt: Date.now(), assessments: [], problems: [] };
  }
  const assessments: Assessment[] = [];
  const problems: Problem[] = [];
  const now = Date.now();
  const staleAfter = staleAfterMs();
  const candidates = names.filter((n) => n.endsWith(".json") && !n.startsWith(".")).sort().reverse();
  const results = await Promise.all(candidates.slice(0, MAX_FILES).map((n) => readAssessmentFile(dir, n)));
  for (const result of results) {
    if (result === null) continue;
    if ("reason" in result) problems.push(result);
    else assessments.push(markIdle(result, now, staleAfter));
  }
  if (candidates.length > MAX_FILES) {
    problems.push({ file: `${candidates.length - MAX_FILES} older files`, reason: `not shown (only the newest ${MAX_FILES} are read)` });
  }
  assessments.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.uid.localeCompare(a.uid));
  return { dir, readAt: now, assessments, problems };
});

/** The folder as shown to the operator ("~/.reconix/assessments"). */
export function shownDir(dir: string): string {
  const home = homedir();
  return dir === home || dir.startsWith(`${home}${path.sep}`) ? `~${dir.slice(home.length)}` : dir;
}

export async function loadAssessment(uid: string): Promise<Assessment | null> {
  if (!UID.test(uid)) return null;
  const { assessments } = await loadLibrary();
  return assessments.find((a) => a.uid === uid) ?? null;
}
