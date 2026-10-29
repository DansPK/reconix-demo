#!/usr/bin/env node
/* Start the static-demo dashboard on 127.0.0.1. No sign-in, no token: it reads the bundled
   sample runs and opens straight to the dashboard.

     npm run dev                   # next dev   (hot reload)
     npm start                     # next start (after npm run build)
     npm run dev -- --no-open      # don't open a browser

   Env: RECONIX_WEB_PORT (3100), RECONIX_DATA_DIR (defaults to the bundled sample-data). */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";

const require = createRequire(import.meta.url);
const mode = process.argv[2] === "dev" ? "dev" : "start";
const openBrowser = !process.argv.includes("--no-open");
const port = process.env.RECONIX_WEB_PORT || "3100";
const url = `http://127.0.0.1:${port}/`;

if (await portInUse(port)) {
  console.error(`[web] 127.0.0.1:${port} is already in use. Stop it (or set RECONIX_WEB_PORT), then start again.`);
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
    // Static demo defaults: bundled sample data, no live polling (the "Static" pill shows).
    RECONIX_DATA_DIR: "sample-data",
    RECONIX_LIVE_REFRESH_MS: "0",
    ...process.env,
    RECONIX_WEB_PORT: port,
  },
});

let announced = false;
child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  if (announced || !/ready/i.test(String(chunk))) return;
  announced = true;
  process.stdout.write(`\n  Reconix analysis dashboard\n  Open  ${url}\n  Press Ctrl+C to stop.\n\n`);
  if (openBrowser) open(url);
});

function open(target) {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [target]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", target]] : ["xdg-open", [target]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch {
    /* no browser available: the URL is printed above */
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
