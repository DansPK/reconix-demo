/* An upload to the Security knowledge page, on its way to the Core API (server only).

   readUpload: the multipart body, counted while it is read and dropped at MAX_BODY_BYTES (413),
   must hold exactly one file in the field `file`, with an allowed extension (a .doc is told to
   become a .docx), not empty and at most MAX_UPLOAD_BYTES (rules.ts). Only then is it parsed. */
import "server-only";

import type { NextResponse } from "next/server";

import { fail, readBytes } from "../assistant/access";
import { cleanName, MAX_BODY_BYTES, TOO_LARGE, type UploadExtension, uploadExtension, uploadProblem } from "./rules";

export interface Upload {
  name: string; // the display name (rules.ts cleanName)
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
