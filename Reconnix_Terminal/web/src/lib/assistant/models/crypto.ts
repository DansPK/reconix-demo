/* The saved API keys' protection (server only): AES-256-GCM with a 32-byte key kept in
   models.key next to models.json (0600, made once with O_EXCL, read without following a link,
   checked through its handle, refused once other users may read it). Every value gets its own random 12-byte IV; the 16-byte tag is
   checked when it is opened, and the provider's id is bound in as associated data, so a sealed
   key copied to another provider in the file doesn't open. Nothing here logs a key, and errors
   are fixed messages. */
import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { type FileHandle, open as openFile, unlink } from "node:fs/promises";
import path from "node:path";

import { code, type Faults, type Folder, myUid, READ_FLAGS, stillSame, WRITE_FLAGS } from "../secure-fs";
import { MODELS_FAIL, ModelsError } from "./errors";
import { MODELS_FORMAT, type Sealed } from "./schema";

export const KEY_FILE = "models.key";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ALGORITHM = "aes-256-gcm";

const aad = (providerId: string) => Buffer.from(`${MODELS_FORMAT}:${providerId}`, "utf8");

/** Seals `plain` (an API key) for provider `providerId`. */
export function seal(plain: string, key: Buffer, providerId: string): Sealed {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad(providerId));
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}

/** Opens a sealed key; throws a fixed error when the key, the tag, the IV or the provider don't
    match (a changed file, another key file). */
export function open(sealed: Sealed, key: Buffer, providerId: string): string {
  try {
    const iv = Buffer.from(sealed.iv, "base64");
    const tag = Buffer.from(sealed.tag, "base64");
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || key.length !== KEY_BYTES) throw new Error("bad sizes");
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(aad(providerId));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(sealed.data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new ModelsError(MODELS_FAIL.sealed);
  }
}

// --- the key file ------------------------------------------------------------------------------

/** The folder's models.key opened and checked through its handle (never following a link), or
    null when there is none yet. Anything but a regular file of this user's holding exactly 32
    bytes is refused, and so is one that other users may read or change: the keys it protected
    are no longer only this user's, so it is never quietly tightened (or replaced). */
async function openKeyFile(f: Folder): Promise<FileHandle | null> {
  let handle: FileHandle;
  try {
    handle = await openFile(/*turbopackIgnore: true*/ path.join(f.dir, KEY_FILE), READ_FLAGS);
  } catch (error) {
    if (code(error) === "ENOENT") return null;
    throw new ModelsError(MODELS_FAIL.key);
  }
  let fault: string | null;
  try {
    const info = await handle.stat();
    const uid = myUid();
    if (!info.isFile() || info.size !== KEY_BYTES || (uid !== null && info.uid !== uid)) fault = MODELS_FAIL.key;
    else fault = uid !== null && (info.mode & 0o077) !== 0 ? MODELS_FAIL.keyShared : null;
  } catch {
    fault = MODELS_FAIL.key;
  }
  if (fault === null) return handle;
  await handle.close().catch(() => {});
  throw new ModelsError(fault);
}

/** The key in the folder's models.key, or null when there is none yet (refused as above). */
export async function readKey(f: Folder): Promise<Buffer | null> {
  const handle = await openKeyFile(f);
  if (!handle) return null;
  try {
    const key = Buffer.alloc(KEY_BYTES);
    const { bytesRead } = await handle.read(key, 0, KEY_BYTES, 0);
    if (bytesRead !== KEY_BYTES) throw new Error("short read");
    return key;
  } catch {
    throw new ModelsError(MODELS_FAIL.key);
  } finally {
    await handle.close().catch(() => {});
  }
}

/** Whether there is a models.key that readKey would accept, checked the same way but without
    reading the key (refused as above). For what only says which model answers. */
export async function hasKey(f: Folder): Promise<boolean> {
  const handle = await openKeyFile(f);
  await handle?.close().catch(() => {});
  return handle !== null;
}

/** The key, made first when there is none (32 random bytes, O_EXCL, 0600). */
export async function ensureKey(f: Folder, fail: Faults): Promise<Buffer> {
  const existing = await readKey(f);
  if (existing) return existing;
  await stillSame(f, fail);
  const key = randomBytes(KEY_BYTES);
  let handle: FileHandle;
  try {
    handle = await openFile(/*turbopackIgnore: true*/ path.join(f.dir, KEY_FILE), WRITE_FLAGS, 0o600);
  } catch (error) {
    if (code(error) === "EEXIST") {
      const made = await readKey(f); // made meanwhile
      if (made) return made;
    }
    throw new ModelsError(MODELS_FAIL.key);
  }
  try {
    await handle.writeFile(key);
    await handle.sync();
    await handle.close();
  } catch {
    await handle.close().catch(() => {});
    await unlink(/*turbopackIgnore: true*/ path.join(f.dir, KEY_FILE)).catch(() => {}); // ours, and unusable
    throw new ModelsError(MODELS_FAIL.key);
  }
  return key;
}
