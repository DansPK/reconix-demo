/* The Security knowledge page's brakes (per dashboard process, kept on globalThis so every route
   module shares them): one upload at a time and at most UPLOADS_PER_MINUTE a minute, and every
   change to the folder (add, remove) one after another, so the CLI never rewrites the index twice
   at once. */

export const UPLOADS_PER_MINUTE = 10;
export const BUSY = "Another upload is still running. Try again when it has finished.";
export const TOO_MANY = "Too many uploads in a minute. Wait a moment and try again.";

const KEY = Symbol.for("reconix.knowledge.gate");
interface Gate {
  recent: number[]; // when the uploads of the last minute started
  uploading: boolean;
  queue: Promise<unknown>;
}
const shared = globalThis as { [KEY]?: Gate };
const gate = (): Gate => (shared[KEY] ??= { recent: [], uploading: false, queue: Promise.resolve() });

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

/** Runs `task` after every change queued before it. */
export function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const g = gate();
  const run = g.queue.then(task, task);
  g.queue = run.catch(() => undefined);
  return run;
}
