/* Reading the knowledge folder the TUI's /add-on writes (paths.ts), server only and READ-ONLY:
   nothing here creates, changes, tightens or deletes the folder or a file in it (the TUI owns
   them; the contract is docs/KNOWLEDGE_OPENAPI_FINDINGS_PLAN.md §4).

   The folder is opened without following a link and checked through that handle: a directory,
   this user's, writable by no one else. A missing folder is no knowledge, and so is a refused
   one. Each file (index.json, then `<id>.json` for each source it lists, the name built from a
   checked id only) is opened the same way as secure-fs.ts reads (O_NOFOLLOW | O_NONBLOCK) and
   checked through its handle: a regular file, this user's, writable by no one else, under its
   size cap. A file that fails a check, isn't JSON or doesn't match its schema is skipped without
   a log line (its content never reaches one), and the other sources still count. After reading,
   the folder must still be the one that was opened (not swapped for another).

   Parsed files are kept in memory by their identity (device, inode, size and change times): an
   unchanged folder is checked again on every question but not read or parsed again. The TUI
   replaces a file atomically, so a change always gives it a new identity.

   readKnowledgeIndex reads the index alone, the same way, for the Security knowledge page's list
   (lib/knowledge/list.ts); the page's changes go through the Python CLI (lib/knowledge/cli.ts),
   never through this module. */
import "server-only";

import type { Stats } from "node:fs";
import { constants, type FileHandle, lstat, open } from "node:fs/promises";
import path from "node:path";

import { myUid, POSIX, READ_FLAGS, readAll } from "../secure-fs";
import { knowledgeDir } from "./paths";
import {
  type IndexEntry,
  INDEX_FILE,
  type KnowledgeIndex,
  KnowledgeIndexSchema,
  type KnowledgeSourceFile,
  KnowledgeSourceSchema,
  sourceFile,
} from "./schema";

export const MAX_INDEX_BYTES = 256 * 1024;
/** One source's file: 2,000 passages of 1,200 characters, JSON-escaped, fit with room. */
export const MAX_SOURCE_FILE_BYTES = 16 * 1024 * 1024;
/** Every source's file together; the sources past it (in the index's order) are left out. */
export const MAX_TOTAL_BYTES = 64 * 1024 * 1024;

const DIR_FLAGS = constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0);
const WRITABLE_BY_OTHERS = 0o022;

/** One source as the ranker reads it: the index's name and the file's passages. */
export interface KnowledgeSource {
  id: string;
  name: string;
  chunks: string[];
}

/** What was read: `missing` (no folder), `refused` (a folder that failed a check) or `ok`.
    `signature` names the files read (their identities), for the ranker's cache. */
export interface KnowledgeRead {
  state: "missing" | "refused" | "ok";
  sources: KnowledgeSource[];
  signature: string;
}

const nothing = (state: "missing" | "refused"): KnowledgeRead => ({ state, sources: [], signature: "" });

/** This user's, and writable by no one else (always true on Windows, which has neither). */
function owned(info: Stats): boolean {
  if (!POSIX) return true;
  const uid = myUid();
  return (uid === null || info.uid === uid) && (info.mode & WRITABLE_BY_OTHERS) === 0;
}

const stampOf = (info: Stats) => `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;

// --- the folder --------------------------------------------------------------------------------

interface Folder {
  handle: FileHandle | null; // null on Windows
  dev: number;
  ino: number;
}

async function openFolder(dir: string): Promise<Folder | "missing" | "refused"> {
  const before = await lstat(/*turbopackIgnore: true*/ dir).catch((error: NodeJS.ErrnoException) => (error.code === "ENOENT" ? "missing" : null));
  if (before === "missing") return "missing";
  if (!before || before.isSymbolicLink() || !before.isDirectory()) return "refused";
  if (!POSIX) return { handle: null, dev: before.dev, ino: before.ino };
  let handle: FileHandle;
  try {
    handle = await open(/*turbopackIgnore: true*/ dir, DIR_FLAGS);
  } catch {
    return "refused"; // swapped for a link or a file since
  }
  try {
    const info = await handle.stat();
    if (info.isDirectory() && owned(info) && info.dev === before.dev && info.ino === before.ino) return { handle, dev: info.dev, ino: info.ino };
  } catch {
    // unreadable: refused below
  }
  await handle.close().catch(() => {});
  return "refused";
}

/** The folder is still the one that was opened (not swapped, not a link). */
async function stillSame(dir: string, f: Folder): Promise<boolean> {
  const now = await lstat(/*turbopackIgnore: true*/ dir).catch(() => null);
  return !!now && !now.isSymbolicLink() && now.isDirectory() && now.dev === f.dev && now.ino === f.ino;
}

// --- the files ---------------------------------------------------------------------------------

type Verdict = { stamp: string; value: unknown };
const CACHE_KEY = Symbol.for("reconix.assistant.knowledge.files");
type Shared = { [CACHE_KEY]?: Map<string, Verdict> };
const shared = globalThis as Shared;
const cache = () => (shared[CACHE_KEY] ??= new Map());

interface FileRead<T> {
  stamp: string;
  size: number;
  value: T;
}

/** A JSON file checked as the file comment says and parsed by `parse` (null: not valid), or
    null. `seen` collects the verdicts of this read (the next cache). */
async function readJson<T>(full: string, max: number, parse: (raw: unknown) => T | null, seen: Map<string, Verdict>): Promise<FileRead<T> | null> {
  if (!POSIX) {
    // Windows has no O_NOFOLLOW: refuse a link by its name first
    const link = await lstat(/*turbopackIgnore: true*/ full).catch(() => null);
    if (!link || link.isSymbolicLink()) return null;
  }
  let handle: FileHandle;
  try {
    handle = await open(/*turbopackIgnore: true*/ full, READ_FLAGS);
  } catch {
    return null; // missing, a link, unreadable
  }
  try {
    const info = await handle.stat();
    if (!info.isFile() || !owned(info) || info.size > max) return null;
    const stamp = stampOf(info);
    const known = cache().get(full);
    if (known && known.stamp === stamp) {
      seen.set(full, known);
      return known.value === null ? null : { stamp, size: info.size, value: known.value as T };
    }
    const bytes = await readAll(handle, info.size);
    if (!bytes) return null; // changing while read: not kept
    let value: T | null = null;
    try {
      value = parse(JSON.parse(bytes.toString("utf8")));
    } catch {
      value = null;
    }
    seen.set(full, { stamp, value });
    return value === null ? null : { stamp, size: info.size, value };
  } catch {
    return null;
  } finally {
    await handle.close().catch(() => {});
  }
}

const parseIndex = (raw: unknown): KnowledgeIndex | null => KnowledgeIndexSchema.safeParse(raw).data ?? null;
const parseSource = (raw: unknown): KnowledgeSourceFile | null => KnowledgeSourceSchema.safeParse(raw).data ?? null;

// --- reading -----------------------------------------------------------------------------------

/** The index alone, for the Security knowledge page's list: `entries` in the index's order, each
    id once (the first counts). An index that is missing, refused or invalid lists nothing; the
    sources' own files are not opened. Never throws for anything on disk. */
export interface KnowledgeIndexRead {
  state: "missing" | "refused" | "ok";
  entries: IndexEntry[];
}

export async function readKnowledgeIndex(dir: string = knowledgeDir()): Promise<KnowledgeIndexRead> {
  const folder = await openFolder(dir);
  if (folder === "missing" || folder === "refused") return { state: folder, entries: [] };
  try {
    const index = await readJson(path.join(dir, INDEX_FILE), MAX_INDEX_BYTES, parseIndex, new Map());
    if (!(await stillSame(dir, folder))) return { state: "refused", entries: [] };
    const ids = new Set<string>();
    const entries = (index?.value.sources ?? []).filter((e) => !ids.has(e.id) && ids.add(e.id));
    return { state: "ok", entries };
  } catch {
    return { state: "refused", entries: [] };
  } finally {
    await folder.handle?.close().catch(() => {});
  }
}

/** Every readable source in the folder, in the index's order (see the file comment). Never
    throws for anything on disk. */
export async function readKnowledge(dir: string = knowledgeDir()): Promise<KnowledgeRead> {
  const folder = await openFolder(dir);
  if (folder === "missing" || folder === "refused") return nothing(folder);
  try {
    const seen = new Map<string, Verdict>();
    const index = await readJson(path.join(dir, INDEX_FILE), MAX_INDEX_BYTES, parseIndex, seen);
    const sources: KnowledgeSource[] = [];
    const stamps: string[] = [];
    if (index) {
      stamps.push(index.stamp);
      const ids = new Set<string>();
      let total = 0;
      for (const entry of index.value.sources) {
        if (ids.has(entry.id)) continue; // listed twice: the first counts
        ids.add(entry.id);
        const room = Math.min(MAX_SOURCE_FILE_BYTES, MAX_TOTAL_BYTES - total);
        const file = await readJson(path.join(dir, sourceFile(entry.id)), room, parseSource, seen);
        if (!file || file.value.id !== entry.id) continue; // missing, refused, corrupt, or another source's
        total += file.size;
        stamps.push(file.stamp);
        sources.push({ id: entry.id, name: entry.name, chunks: file.value.chunks });
      }
    }
    if (!(await stillSame(dir, folder))) return nothing("refused");
    shared[CACHE_KEY] = seen; // only what this folder holds now
    return { state: "ok", sources, signature: stamps.join("|") };
  } catch {
    return nothing("refused");
  } finally {
    await folder.handle?.close().catch(() => {});
  }
}
