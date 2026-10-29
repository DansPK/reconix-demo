/* What an upload to the Security knowledge page may be (pure; the upload dialog pre-checks with it
   and POST /api/knowledge decides with it, then the Python CLI checks the file again as /add-on
   does: reconix/store/knowledge/extract.py). The types and the 10 MB cap are /add-on's. A file's
   name is shown and saved, never used as a path: cleanName keeps its base name only. */

/** At most 10 MB (extract.py MAX_FILE_BYTES). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "10 MB";
/** The whole multipart body: the file plus room for its part's headers and the boundaries. */
export const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;
/** A source's display name, in characters (code points; the index's MAX_NAME). */
export const MAX_NAME = 120;

/** The extensions an upload may have, and the kind each is saved as. */
export const UPLOAD_KINDS = {
  ".docx": "docx",
  ".pdf": "pdf",
  ".txt": "txt",
  ".md": "md",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
} as const;
export type UploadExtension = keyof typeof UPLOAD_KINDS;
export type UploadKind = (typeof UPLOAD_KINDS)[UploadExtension];

/** The file input's `accept`. */
export const UPLOAD_ACCEPT = Object.keys(UPLOAD_KINDS).join(",");
/** The types in words, for the hint and the refusals. */
export const UPLOAD_TYPES = "DOCX, PDF, TXT, MD, JSON or YAML";

export const DOC_REFUSED = "A .doc file can't be read. Save it as .docx first.";
export const TYPE_REFUSED = `That type of file can't be added. Use ${UPLOAD_TYPES}.`;
export const TOO_LARGE = `The file is over ${MAX_UPLOAD_LABEL}.`;
export const EMPTY_FILE = "The file is empty.";

/** A file name's extension, lower case with its dot (".pdf"), or "". */
export function extensionOf(name: string): string {
  const base = baseName(name);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot).toLowerCase() : "";
}

/** The extension, when it is one an upload may have. */
export function uploadExtension(name: string): UploadExtension | null {
  const ext = extensionOf(name);
  return Object.hasOwn(UPLOAD_KINDS, ext) ? (ext as UploadExtension) : null;
}

/** Why a file can't be uploaded, or null when it may be. */
export function uploadProblem(file: { name: string; size: number }): string | null {
  if (!uploadExtension(file.name)) return extensionOf(file.name) === ".doc" ? DOC_REFUSED : TYPE_REFUSED;
  if (file.size > MAX_UPLOAD_BYTES) return TOO_LARGE;
  if (file.size === 0) return EMPTY_FILE;
  return null;
}

/** The last part of a name, whichever separator a browser or a system put in it. */
const baseName = (name: string) => name.split(/[\\/]/).pop() ?? "";

/** A name as the CLI is given it: the base name only, on one line, without control or invisible
    formatting characters or `<` `>`, no leading dash (it could read as an option), at most
    MAX_NAME characters with the extension kept; "upload<ext>" when nothing is left. */
export function cleanName(raw: string): string {
  const ext = uploadExtension(raw) ?? "";
  const flat = baseName(raw)
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}<>]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^-+/, "")
    .trim();
  const chars = [...flat];
  if (chars.length <= MAX_NAME) return flat && flat !== ext ? flat : `upload${ext}`;
  const stem = chars.slice(0, chars.length - ext.length).slice(0, MAX_NAME - ext.length).join("").trimEnd();
  return `${stem}${ext}`;
}
