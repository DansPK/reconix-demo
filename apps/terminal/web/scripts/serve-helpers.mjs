/* The careful steps of scripts/serve.mjs, kept apart so tests/serve-helpers.test.ts can run
   them on their own:

   - buildIsStale: `npm start` serves the production build, so it is (re)built first whenever it
     is missing or older than the code it was built from (saved runs are read at request time
     and never need a build).

   - waitUntilAnswering: Next.js prints "Ready" before it has loaded next.config.ts, so a config
     that fails only shows on the first request. The sign-in link is written and the browser
     opened only once a real request answered, never for a server that already stopped.
   - openPrivately: the browser is opened on a private redirect file (folder 0700, file 0600,
     removed after a minute), never on the link itself, so the token doesn't show up in other
     users' view of the process list. */
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** What a production build is made from, relative to web/ (folders are walked). */
export const BUILD_INPUTS = [
  "src", "public", "next.config.ts", "package.json", "package-lock.json", "tsconfig.json",
  "postcss.config.mjs",
];

/** The newest modification time under `entry` (0 when it is missing). */
function newestMtime(entry) {
  let stat;
  try {
    stat = statSync(entry);
  } catch {
    return 0;
  }
  if (!stat.isDirectory()) return stat.mtimeMs;
  let newest = stat.mtimeMs; // a deleted file still moves its folder's time
  for (const name of readdirSync(entry)) newest = Math.max(newest, newestMtime(path.join(entry, name)));
  return newest;
}

/** True when web/.next holds no production build, or one older than any of its inputs.
    @param {string} webDir
    @returns {boolean} */
export function buildIsStale(webDir, inputs = BUILD_INPUTS) {
  const built = newestMtime(path.join(webDir, ".next", "BUILD_ID"));
  if (!built) return true;
  return inputs.some((input) => newestMtime(path.join(webDir, input)) > built);
}

/** How long the server may take to answer its first request (a first `next dev` compile is
    slow; `next start` answers at once), each try, and the pause between tries. */
export const ANSWER_WITHIN_MS = 150_000;
const TRY_MS = 30_000;
const PAUSE_MS = 500;

/** The redirect file lives this long: enough for the browser to read it. */
export const REDIRECT_LIFETIME_MS = 60_000;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** True once GET `url` answers below 500 (a sign-in page, a redirect); false when `stopped()`
    turns true first or nothing answered within `within` ms. Never follows a redirect.
    @param {string} url
    @param {{ stopped?: () => boolean, within?: number, tryMs?: number, pauseMs?: number }} [options]
    @returns {Promise<boolean>} */
export async function waitUntilAnswering(url, { stopped = () => false, within = ANSWER_WITHIN_MS, tryMs = TRY_MS, pauseMs = PAUSE_MS } = {}) {
  const deadline = Date.now() + within;
  while (!stopped() && Date.now() < deadline) {
    if (await answers(url, Math.min(tryMs, Math.max(1, deadline - Date.now())))) return !stopped();
    if (!stopped()) await sleep(pauseMs);
  }
  return false;
}

async function answers(url, ms) {
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(ms) });
    await response.body?.cancel();
    return response.status < 500;
  } catch {
    return false; // not listening yet, reset, or too slow this time
  }
}

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Writes the private redirect file for `url` and returns its path and a cleanup. */
export function redirectFile(url) {
  const dir = mkdtempSync(path.join(tmpdir(), "reconix-web-")); // 0700
  const file = path.join(dir, "open.html");
  const href = escapeHtml(url);
  writeFileSync(
    file,
    `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${href}">` +
      `<title>Reconix</title><a href="${href}">Open the Reconix dashboard</a>\n`,
    { mode: 0o600, flag: "wx" },
  );
  return { file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** The desktop's opener for a file, per platform. */
export function openerFor(file, platform = process.platform) {
  if (platform === "darwin") return ["open", [file]];
  if (platform === "win32") return ["cmd", ["/c", "start", "", file]];
  return ["xdg-open", [file]];
}

/** Opens `url` in the browser through a redirect file; returns the cleanup (it also runs by
    itself after REDIRECT_LIFETIME_MS). `launch` is the spawner (tests pass a stand-in).
    @param {string} url
    @param {{ launch?: (cmd: string, args: string[], options: object) => { on: (event: string, fn: () => void) => { unref: () => void } }, lifetime?: number }} [options]
    @returns {() => void} */
export function openPrivately(url, { launch = spawn, lifetime = REDIRECT_LIFETIME_MS } = {}) {
  const { file, cleanup } = redirectFile(url);
  const [cmd, args] = openerFor(file);
  try {
    launch(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch {
    /* no browser available: the link is printed (or its file named) by the caller */
  }
  setTimeout(cleanup, lifetime).unref();
  return cleanup;
}
