/* The Security knowledge page's brakes (per dashboard process, kept on globalThis so every route
   module shares them): one upload at a time and at most UPLOADS_PER_MINUTE a minute. */

export const UPLOADS_PER_MINUTE = 10;
export const BUSY = "Another upload is still running. Try again when it has finished.";
export const TOO_MANY = "Too many uploads in a minute. Wait a moment and try again.";

const KEY = Symbol.for("reconix.knowledge.gate");
interface Gate {
  recent: number[]; // when the uploads of the last minute started
  uploading: boolean;
}
const shared = globalThis as { [KEY]?: Gate };
const gate = (): Gate => (shared[KEY] ??= { recent: [], uploading: false });

/** A slot for one upload (call the returned release() when it ends), or why there is none:
    `busy` while another upload runs, `rate` past the minute's uploads. */
export function takeUpload(now: number = Date.now()): (() => void) | "busy" | "rate" {
  const g = gate();
  while (g.recent.length && now - g.recent[0] >= 60_000) g.recent.shift();
  if (g.uploading) return "busy";
  if (g.recent.length >= UPLOADS_PER_MINUTE) return "rate";
  g.recent.push(now);
  g.uploading = true;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    g.uploading = false;
  };
}
