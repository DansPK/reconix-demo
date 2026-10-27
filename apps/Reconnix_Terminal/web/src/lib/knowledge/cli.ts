/* The Python knowledge CLI the Security knowledge page hands its changes to (server only): the
   same code as the TUI's /add-on, so a file added from the web is checked, masked and split
   exactly as one added in the terminal (docs/WEB_KNOWLEDGE_PAGE_AND_MODELS_PLAN.md, "The CLI
   contract"):

     python -m reconix.knowledge add --file <path> --name <display name> --source web
     python -m reconix.knowledge original <id>     # the original's bytes on stdout
     python -m reconix.knowledge remove <id>

   Exit 0 is done (one JSON object on stdout, except `original`), 2 a refusal fit for the operator
   ({"ok":false,"error"} on stdout, or on stderr for `original`), anything else an internal error.

   The Python is the dashboard's own (RECONIX_PYTHON, else the repo's .venv, else python3/python),
   as the TUI's /web passes it (web_server.py). It runs from the repo root with fixed
   arguments and no shell, with a minimal environment (never an LLM_* key or the launch token),
   and is killed after CLI_TIMEOUT_MS or once its output passes its cap. Its output is never
   logged. Tests only: with RECONIX_KNOWLEDGE_CLI_TEST=1, RECONIX_KNOWLEDGE_CLI names a stand-in script
   (.mjs/.js run with this Node, anything else with the Python) that keeps the same contract
   (e2e/knowledge-cli-stub.mjs); without the flag it is ignored. */
import "server-only";

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { knowledgeDir } from "../assistant/knowledge/paths";

export const CLI_TIMEOUT_MS = 60_000;
/** `add`, `list` and `remove` print one small JSON object. */
export const MAX_JSON_OUTPUT = 1024 * 1024;
/** `original` prints the file: at most 10 MB, with room. */
export const MAX_ORIGINAL_OUTPUT = 11 * 1024 * 1024;
const MAX_STDERR = 64 * 1024;

type Env = Record<string, string | undefined>;
const WINDOWS = process.platform === "win32";

/** The repository's root: the dashboard runs from web/ (npm start, npm run dev, the tests). */
export const repoRoot = () => path.resolve(/*turbopackIgnore: true*/ process.cwd(), "..");

/** The Python that runs Reconix: RECONIX_PYTHON, else the repo's .venv, else python3 (python on
    Windows). */
export function pythonCommand(env: Env = process.env): string {
  const chosen = env.RECONIX_PYTHON?.trim();
  if (chosen) return chosen;
  const venv = path.join(/*turbopackIgnore: true*/ repoRoot(), ".venv", WINDOWS ? "Scripts/python.exe" : "bin/python");
  return existsSync(/*turbopackIgnore: true*/ venv) ? venv : WINDOWS ? "python" : "python3";
}

/** The program and the arguments before the command: the real CLI, or (tests only) a stand-in. */
export function cliCommand(env: Env = process.env): { program: string; prefix: string[] } {
  const stub = env.RECONIX_KNOWLEDGE_CLI_TEST === "1" ? env.RECONIX_KNOWLEDGE_CLI?.trim() : "";
  if (stub) {
    const script = path.resolve(/*turbopackIgnore: true*/ process.cwd(), stub); // the CLI runs from the repo root
    return { program: /\.[cm]?js$/.test(stub) ? process.execPath : pythonCommand(env), prefix: [script] };
  }
  return { program: pythonCommand(env), prefix: ["-m", "reconix.knowledge"] };
}

// what Python and the system need on Windows to start at all (none of it secret)
const WINDOWS_KEYS = ["SYSTEMROOT", "WINDIR", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP", "PATHEXT", "COMSPEC"];

/** The CLI's whole environment: PATH, HOME, the knowledge folder (resolved here, so both sides
    agree on it) and its key file, UTF-8 output; nothing else of the dashboard's. */
export function cliEnv(env: Env = process.env): Record<string, string> {
  const out: Record<string, string> = { RECONIX_KNOWLEDGE_DIR: knowledgeDir(env), PYTHONUTF8: "1" };
  for (const key of ["PATH", "HOME", "RECONIX_KNOWLEDGE_KEY_FILE", ...(WINDOWS ? WINDOWS_KEYS : [])]) {
    const value = env[key];
    if (value) out[key] = value;
  }
  return out;
}

/** How one run ended. `started`: false when the program couldn't be run at all. */
export interface CliRun {
  started: boolean;
  code: number | null;
  stdout: Buffer;
  stderr: string;
  timedOut: boolean;
  overflow: boolean; // stdout passed its cap (the process was killed)
}

/** Runs the CLI with `args` (never through a shell) and collects what it prints. Never throws. */
export function runCli(args: string[], { maxStdout = MAX_JSON_OUTPUT, timeoutMs = CLI_TIMEOUT_MS } = {}): Promise<CliRun> {
  return new Promise((resolve) => {
    const { program, prefix } = cliCommand();
    const out: Buffer[] = [];
    let size = 0;
    let stderr = "";
    let timedOut = false;
    let overflow = false;
    let settled = false;
    const finish = (run: Omit<CliRun, "stdout" | "stderr" | "timedOut" | "overflow">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...run, stdout: Buffer.concat(out), stderr, timedOut, overflow });
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(program, [...prefix, ...args], {
        cwd: repoRoot(),
        env: cliEnv() as NodeJS.ProcessEnv, // only these keys: nothing else of the dashboard's
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        windowsHide: true,
      });
    } catch {
      resolve({ started: false, code: null, stdout: Buffer.alloc(0), stderr: "", timedOut: false, overflow: false });
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      if (overflow) return;
      size += chunk.length;
      if (size > maxStdout) {
        overflow = true;
        out.length = 0;
        child.kill("SIGKILL");
        return;
      }
      out.push(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < MAX_STDERR) stderr += chunk.toString("utf8").slice(0, MAX_STDERR - stderr.length);
    });
    child.on("error", () => finish({ started: false, code: null }));
    child.on("close", (code) => finish({ started: true, code }));
  });
}
