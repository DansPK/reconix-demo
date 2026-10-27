/* An upload to the Security knowledge page, on its way to the CLI (server only).

   readUpload: the multipart body, counted while it is read and dropped at MAX_BODY_BYTES (413),
   must hold exactly one file in the field `file`, with an allowed extension (a .doc is told to
   become a .docx), not empty and at most MAX_UPLOAD_BYTES (rules.ts). Only then is it parsed.

   withPrivateCopy: the file is written to a new private folder (mkdtemp, 0700) as a 0600 file with
   a random name and the upload's extension (opened O_EXCL, never following a link), handed to
   `task`, and the folder is removed afterwards whatever happened. The upload's own name never
   becomes a path. */
import "server-only";

import { randomBytes } from "node:crypto";
import { chmod, mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { NextResponse } from "next/server";

import { fail, readBytes } from "../assistant/access";
import { POSIX, WRITE_FLAGS } from "../assistant/secure-fs";
import { cleanName, MAX_BODY_BYTES, TOO_LARGE, type UploadExtension, uploadExtension, uploadProblem } from "./rules";

export interface Upload {
  name: string; // the display name for the CLI (rules.ts cleanName)
  ext: UploadExtension;
  bytes: Uint8Array;
}

export const NOT_MULTIPART = "Send the file as multipart/form-data.";
export const ONE_FILE = "Send exactly one file, in the field “file”.";
export const UNREADABLE = "The upload could not be read. Try again.";

/** The one uploaded file, or the refusal to answer with. */
export async function readUpload(request: Request): Promise<{ ok: true; upload: Upload } | { ok: false; response: NextResponse }> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;\s*boundary=/i.test(type)) return { ok: false, response: fail(NOT_MULTIPART, 415) };
  const body = await readBytes(request, MAX_BODY_BYTES);
  if (body === null) return { ok: false, response: fail(TOO_LARGE, 413) };
  let form: FormData;
  try {
    form = await new Response(new Uint8Array(body), { headers: { "content-type": type } }).formData();
  } catch {
    return { ok: false, response: fail(UNREADABLE, 400) };
  }
  const entries = [...form.entries()];
  const file = entries.length === 1 && entries[0][0] === "file" ? entries[0][1] : null;
  if (!file || typeof file === "string") return { ok: false, response: fail(ONE_FILE, 400) };
  const problem = uploadProblem(file);
  if (problem) return { ok: false, response: fail(problem, problem === TOO_LARGE ? 413 : 400) };
  return { ok: true, upload: { name: cleanName(file.name), ext: uploadExtension(file.name)!, bytes: new Uint8Array(await file.arrayBuffer()) } };
}

/** Runs `task` with the path of a private copy of the upload, then removes the copy and its folder. */
export async function withPrivateCopy<T>(upload: Upload, task: (file: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "reconix-upload-"));
  try {
    if (POSIX) await chmod(dir, 0o700); // mkdtemp makes it 0700; this holds whatever the umask
    const file = path.join(dir, `${randomBytes(16).toString("hex")}${upload.ext}`);
    const handle = await open(/*turbopackIgnore: true*/ file, WRITE_FLAGS, 0o600);
    try {
      await handle.writeFile(upload.bytes);
    } finally {
      await handle.close();
    }
    return await task(file);
  } finally {
    await rm(/*turbopackIgnore: true*/ dir, { recursive: true, force: true }).catch(() => {});
  }
}
