/* The Security knowledge upload's size limits. next.config.ts reads MAX_BODY_BYTES, and Next.js
   loads that config without the "@/" path alias, so this file imports nothing (see
   tests/next-config-imports.test.ts). rules.ts re-exports these for the rest of the app. */

/** At most 10 MB (extract.py MAX_FILE_BYTES). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "10 MB";
/** The whole multipart body: the file plus room for its part's headers and the boundaries. */
export const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;
