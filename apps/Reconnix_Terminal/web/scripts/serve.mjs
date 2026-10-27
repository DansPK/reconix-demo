#!/usr/bin/env node
/* Start the dashboard on 127.0.0.1 with a fresh launch token, then print (and open) the
   sign-in link.

     npm start                     # next start  (after npm run build)
     npm run dev                   # next dev    (hot reload)
     npm start -- --no-open        # don't open a browser

   Env: RECONIX_WEB_PORT (3100), RECONIX_DATA_DIR (~/.reconix/assessments), RECONIX_PYTHON
        (the Python the Security knowledge page runs: the repo's .venv, else python3; python
        on Windows), RECONIX_WEB_TOKEN (only for tests; normally a new random token each start). */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const mode = process.argv[2] === "dev" ? "dev" : "start";
const openBrowser = !process.argv.includes("--no-open");
const port = process.env.RECONIX_WEB_PORT || "3100";
const token = process.env.RECONIX_WEB_TOKEN || randomBytes(24).toString("base64url");
const link = `http://127.0.0.1:${port}/login#token=${token}`;
const dataDir = process.env.RECONIX_DATA_DIR || "~/.reconix/assessments";

/* Never start next to another dashboard on the same port: Next.js would fail, and nothing of
   the running one (its link file in particular) may be touched. */
if (await portInUse(port)) {
  console.error(
    `[web] 127.0.0.1:${port} is already in use, probably by another Reconix dashboard. ` +
      "Stop it (or set RECONIX_WEB_PORT), then start again.",
  );
  process.exit(2);
}

function portInUse(p) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", (error) => resolve(error.code === "EADDRINUSE"));
    probe.once("listening", () => probe.close(() => resolve(false)));
    probe.listen(Number(p), "127.0.0.1");
  });
}

const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), mode, "-H", "127.0.0.1", "-p", port], {
  stdio: ["inherit", "pipe", "inherit"],
  env: {
    ...process.env,
    RECONIX_WEB_TOKEN: token,
    RECONIX_WEB_PORT: port,
  },
});

let announced = false;
child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  if (announced || !/ready/i.test(String(chunk))) return;
  announced = true;
  writeLink();
  process.stdout.write(
    `\n  Reconix analysis dashboard\n` +
      `  Data     ${dataDir}\n` +
      `  Sign in  ${signInLine()}\n` +
      `  The link changes every time the dashboard starts. Press Ctrl+C to stop.\n` +
      `  From the TUI, run /web to open it.\n\n`,
  );
  if (openBrowser) open(link);
});

/* The link signs in (the AI Assistant, the Security knowledge page), so it is printed only to a
   terminal, never into a log (started by the TUI, our output goes to ~/.reconix/web.log). */
function signInLine() {
  return process.stdout.isTTY ? link : `the link is in ${linkFile} (/web in the TUI opens it)`;
}

/* Drop the sign-in link where the TUI's /web command looks for it (private: 0700/0600),
   and remove it on exit so a stale link is never opened. */
const linkFile = process.env.RECONIX_WEB_URL_FILE || path.join(homedir(), ".reconix", "web.url");

function writeLink() {
  try {
    mkdirSync(path.dirname(linkFile), { recursive: true, mode: 0o700 });
    writeFileSync(linkFile, `${link}\n`, { mode: 0o600 });
  } catch {
    /* best effort: the link is printed above */
  }
}

/* Only our own link: the file is shared, and another dashboard may have written it since. */
function removeLink() {
  try {
    if (readFileSync(linkFile, "utf8").trim() === link) rmSync(linkFile, { force: true });
  } catch {
    /* gone already, or unreadable: leave it */
  }
}

/* The browser is opened on a private redirect file (folder 0700, file 0600), never on the
   link itself, so the token doesn't show up in other users' view of the process list. */
let redirectDir = "";

function open(url) {
  redirectDir = mkdtempSync(path.join(tmpdir(), "reconix-web-"));
  const file = path.join(redirectDir, "open.html");
  writeFileSync(
    file,
    `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${url}">` +
      `<title>Reconix</title><a href="${url}">Open the Reconix dashboard</a>\n`,
    { mode: 0o600 },
  );
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [file]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", file]] : ["xdg-open", [file]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch {
    /* no browser available: the link is printed above */
  }
  setTimeout(cleanup, 60_000).unref();
}

function cleanup() {
  if (redirectDir) rmSync(redirectDir, { recursive: true, force: true });
  redirectDir = "";
}

for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  cleanup();
  removeLink();
  process.exit(code ?? 0);
});
