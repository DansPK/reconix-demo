/* Print the HTML report to PDF with a headless Chrome/Chromium on the dashboard machine
   (no extra Node dependencies). `RECONIX_CHROME` names the browser; otherwise the usual
   names on PATH and the common install locations are tried. Returns null when none exists;
   the export route then answers 501 with a hint and a link to the Word (DOCX) export. The paths it
   probes are outside the project on purpose (turbopackIgnore, as lib/data/store.ts). */
import "server-only";

import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const WINDOWS = process.platform === "win32";
const NAMES = WINDOWS
  ? ["chrome.exe", "msedge.exe"]
  : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"];
/* Where Chrome and Edge (Chromium, on every Windows 10+) install on Windows. */
const WINDOWS_PATHS = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA]
  .filter((base): base is string => Boolean(base))
  .flatMap((base) => [
    path.join(/*turbopackIgnore: true*/ base, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(/*turbopackIgnore: true*/ base, "Microsoft", "Edge", "Application", "msedge.exe"),
  ]);
const PATHS = [
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ...WINDOWS_PATHS,
];
const TIMEOUT_MS = 90_000;

const runnable = (file: string) => {
  try {
    accessSync(/*turbopackIgnore: true*/ file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/** A Chrome/Chromium executable to print with, or null. */
export function chromeBinary(): string | null {
  const override = process.env.RECONIX_CHROME;
  if (override) return runnable(override) ? override : null;
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    for (const name of NAMES) {
      const candidate = path.join(/*turbopackIgnore: true*/ dir, name);
      if (dir && runnable(candidate)) return candidate;
    }
  }
  return PATHS.find(runnable) ?? null;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("the browser took too long to print the PDF"));
    }, TIMEOUT_MS);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`the browser exited with code ${code}`));
    });
  });
}

/** The HTML report rendered to PDF bytes, or null when no browser is available. */
export async function renderPdf(html: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const chrome = chromeBinary();
  if (!chrome) return null;
  const dir = await mkdtemp(path.join(tmpdir(), "reconix-pdf-"));
  try {
    const source = path.join(dir, "report.html");
    const target = path.join(dir, "report.pdf");
    await writeFile(source, html, { encoding: "utf8", mode: 0o600 });
    await run(chrome, [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-pdf-header-footer",
      `--print-to-pdf=${target}`,
      pathToFileURL(source).href,
    ]);
    const pdf = await readFile(target);
    if (!pdf.byteLength) return null;
    const bytes = new Uint8Array(new ArrayBuffer(pdf.byteLength)); // a plain ArrayBuffer: valid Response body
    bytes.set(pdf);
    return bytes;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
