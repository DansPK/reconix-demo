/* The AI Assistant's folder on disk (server only): the safe file handling shared by the saved
   conversations (history-store.ts) and the saved models (models/store.ts). They live together
   in ~/.reconix/assistant/ (RECONIX_ASSISTANT_DIR moves it, e.g. for tests).

   The folder: its parent must belong to this user (or root) and not be writable by others
   unless sticky (like /tmp); the folder itself is opened without following a link, checked
   through that handle (a directory, this user's) and tightened through it (fchmod 0700). Before
   each write and rename it must still be the same folder (device and inode).

   Writing is atomic: a new temporary file (O_EXCL, 0600, never following a link), then a rename
   over the old one. Reading opens without following links and checks through the handle: a
   regular file, at most `max` bytes. One queue (kept on globalThis, so every route shares it)
   serializes this process's changes to the folder. Each caller names its own errors (fixed
   messages, never a path) through `Faults`. */
import "server-only";

import { randomBytes } from "node:crypto";
import { constants, type FileHandle, lstat, mkdir, open, rename, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const POSIX = process.platform !== "win32";
export const READ_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
export const WRITE_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0);
const DIR_FLAGS = constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0);

export const code = (error: unknown) => (error as NodeJS.ErrnoException | null)?.code;
export const myUid = () => (POSIX && typeof process.getuid === "function" ? process.getuid() : null);

/** The assistant's folder: RECONIX_ASSISTANT_DIR (a leading ~/ is the home folder), or
    ~/.reconix/assistant. */
export function assistantDir(env: Record<string, string | undefined> = process.env): string {
  const configured = env.RECONIX_ASSISTANT_DIR?.trim();
  if (!configured) return path.join(homedir(), ".reconix", "assistant");
  const expanded = configured.startsWith("~/") ? path.join(homedir(), configured.slice(2)) : configured;
  return path.resolve(expanded);
}

// --- one queue for every route of this process -------------------------------------------------

const QUEUE = Symbol.for("reconix.assistant.history.queue");
type Shared = { [QUEUE]?: Promise<unknown> };
const shared = globalThis as Shared;

/** Runs `task` after every change queued before it (one at a time, whatever each one does). */
export function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = (shared[QUEUE] ?? Promise.resolve()).then(task, task);
  shared[QUEUE] = run.catch(() => undefined);
  return run;
}

// --- the folder ------------------------------------------------------------------------------

/** What can go wrong with the folder; each store turns these into its own errors. */
export type Fault = "folder" | "plain" | "owner" | "parent" | "moved";
export type Faults = (fault: Fault) => Error;

export interface Folder {
  dir: string;
  handle: FileHandle | null; // null on Windows
  dev: number;
  ino: number;
}

/** The parent of the folder: this user's (or root's), not writable by others unless sticky. */
export async function checkParent(dir: string, fail: Faults): Promise<void> {
  const parent = path.dirname(dir);
  try {
    await mkdir(/*turbopackIgnore: true*/ parent, { recursive: true, mode: 0o700 });
  } catch {
    throw fail("folder");
  }
  if (!POSIX) return;
  const info = await stat(/*turbopackIgnore: true*/ parent).catch(() => null);
  if (!info || !info.isDirectory()) throw fail("folder");
  const uid = myUid();
  if (uid !== null && info.uid !== uid && info.uid !== 0) throw fail("parent");
  if ((info.mode & 0o022) !== 0 && (info.mode & 0o1000) === 0) throw fail("parent");
}

/** The folder `dir`, made if missing (0700) and opened without following a link. */
export async function openFolder(dir: string, fail: Faults): Promise<Folder> {
  await checkParent(dir, fail);
  try {
    await mkdir(/*turbopackIgnore: true*/ dir, { mode: 0o700 });
  } catch (error) {
    if (code(error) !== "EEXIST") throw fail("folder");
  }
  if (!POSIX) {
    const info = await lstat(/*turbopackIgnore: true*/ dir).catch(() => null);
    if (!info || info.isSymbolicLink() || !info.isDirectory()) throw fail("plain");
    return { dir, handle: null, dev: info.dev, ino: info.ino };
  }
  let handle: FileHandle;
  try {
    handle = await open(/*turbopackIgnore: true*/ dir, DIR_FLAGS);
  } catch (error) {
    throw fail(code(error) === "ELOOP" || code(error) === "ENOTDIR" ? "plain" : "folder");
  }
  const refuse = async (fault: Fault): Promise<never> => {
    await handle.close().catch(() => {});
    throw fail(fault);
  };
  let info;
  try {
    info = await handle.stat();
  } catch {
    return refuse("folder");
  }
  if (!info.isDirectory()) return refuse("plain");
  const uid = myUid();
  if (uid !== null && info.uid !== uid) return refuse("owner");
  if ((info.mode & 0o077) !== 0) {
    try {
      await handle.chmod(0o700);
    } catch {
      return refuse("folder");
    }
  }
  return { dir, handle, dev: info.dev, ino: info.ino };
}

/** Throws unless the folder is still the one that was opened (not swapped, not a link). */
export async function stillSame(f: Folder, fail: Faults): Promise<void> {
  const now = await lstat(/*turbopackIgnore: true*/ f.dir).catch(() => null);
  if (!now || now.isSymbolicLink() || !now.isDirectory() || now.dev !== f.dev || now.ino !== f.ino) throw fail("moved");
}

/** Runs `task` with the folder open, and closes it after. */
export async function inFolder<T>(dir: string, fail: Faults, task: (f: Folder) => Promise<T>): Promise<T> {
  const f = await openFolder(dir, fail);
  try {
    return await task(f);
  } finally {
    await f.handle?.close().catch(() => {});
  }
}

// --- the files ---------------------------------------------------------------------------------

/** The bytes of an open file whose size was `size` when checked, or null when it holds more
    than that now (it is changing). */
export async function readAll(handle: FileHandle, size: number): Promise<Buffer | null> {
  const buffer = Buffer.alloc(size + 1);
  let filled = 0;
  while (filled < buffer.length) {
    const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, filled);
    if (!bytesRead) break;
    filled += bytesRead;
  }
  return filled > size ? null : buffer.subarray(0, filled);
}

/** A file's bytes through one handle that never follows a link, or null (missing, a link, not a
    regular file, over `max` bytes, changing, unreadable). */
export async function readBytes(full: string, max: number): Promise<Buffer | null> {
  let handle: FileHandle;
  try {
    handle = await open(/*turbopackIgnore: true*/ full, READ_FLAGS);
  } catch {
    return null;
  }
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > max) return null;
    return await readAll(handle, info.size);
  } catch {
    return null;
  } finally {
    await handle.close().catch(() => {});
  }
}

/** A file's text (UTF-8), or null as readBytes. */
export async function readText(full: string, max: number): Promise<string | null> {
  return (await readBytes(full, max))?.toString("utf8") ?? null;
}

/** Writes `data` to `name` in the folder atomically: a new temporary file named `tmpName`
    (O_EXCL, 0600), synced, then renamed over `name` (a link at that name is replaced, never
    written through). `failSave` makes the error for anything but a moved folder. */
export async function writeAtomic(f: Folder, name: string, tmpName: string, data: string | Uint8Array, fail: Faults, failSave: () => Error): Promise<void> {
  await stillSame(f, fail);
  const tmp = path.join(f.dir, tmpName);
  let handle: FileHandle;
  try {
    handle = await open(/*turbopackIgnore: true*/ tmp, WRITE_FLAGS, 0o600);
  } catch {
    throw failSave();
  }
  try {
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
  } catch {
    await handle.close().catch(() => {});
    await unlink(tmp).catch(() => {});
    throw failSave();
  }
  try {
    await stillSame(f, fail);
  } catch (error) {
    await unlink(tmp).catch(() => {});
    throw error;
  }
  try {
    await rename(tmp, path.join(f.dir, name));
  } catch {
    await unlink(tmp).catch(() => {});
    throw failSave();
  }
}

/** A random suffix for a temporary file's name. */
export const tempSuffix = () => randomBytes(6).toString("hex");
