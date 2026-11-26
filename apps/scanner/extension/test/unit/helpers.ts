import { execFileSync } from "child_process";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import { McpBackend } from "../../src/backend/McpBackend";
import { toFinding, type Finding as WireFinding } from "../../src/backend/wire";
import type { Finding, ScanSummary } from "../../src/shared/contract";
import { runScanFlow, type ScanFlowOptions } from "../../src/scanFlow";
import { DEMO_FINDINGS, FakeHarness, type FakeOptions } from "../../server/server";

export async function makeTree(files: Record<string, string | Buffer>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vs-test-"));
  for (const [rel, data] of Object.entries(files)) {
    const full = path.join(root, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }
  return root;
}

/** The scanner server and the extension's backend on it. */
export async function startDemo(options: FakeOptions = {}) {
  const fake = new FakeHarness({ stepMs: 5, findings: DEMO_FINDINGS, ...options });
  await fake.start();
  const backend = new McpBackend({ serverUrl: fake.url, getToken: async () => fake.token, pollMs: 2 });
  return { fake, backend, stop: () => fake.stop() };
}

/** The options of a scan of `rootDir`; every progress update goes to `updates`. */
export function scanOptions(rootDir: string, sessionId: string, updates: ScanSummary[] = [], signal?: AbortSignal): ScanFlowOptions {
  return { rootDir, sessionId, maxFileSizeKB: 2048, maxUploadMB: 200, extraExcludes: [], onProgress: (s) => updates.push(s), signal };
}

/** Scans `root` in the session and returns the summary with every finding. */
export async function scan(backend: McpBackend, sessionId: string, root: string, paths?: string[]) {
  const summary = (await runScanFlow(backend, { ...scanOptions(root, sessionId), paths }))!;
  return { summary, findings: (await backend.getFindings(summary.scanId, { includeLikelyFalsePositives: true })).items };
}

/** A fresh copy of the pristine storefront (apps/lumina-site.zip). Returns its folder. */
export async function extractLumina(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lumina-"));
  const zip = path.resolve(__dirname, "../../../../../lumina-site.zip");
  if (process.platform === "win32") execFileSync(path.join(process.env.SystemRoot!, "System32", "tar.exe"), ["-xf", zip, "-C", dir]);
  else execFileSync("unzip", ["-q", zip, "-d", dir]);
  return path.join(dir, "lumina-site");
}

/** Lumina's findings as a scan returns them, plus a second scanner's hit and two likely false alarms (one a secret). */
export const LUMINA: Finding[] = [
  ...DEMO_FINDINGS.map((f) => f),
  { ...DEMO_FINDINGS[0], tools: ["trivy"], rule_id: "sql-injection-2" },
  { path: "src/lib/format.js", title: "Unsafe regular expression", severity: "low", rule_id: "redos", cwe: "CWE-1333", tools: ["semgrep"],
    start_line: 3, end_line: 3, message: "m", snippet: "", verdict: "likely_false_positive", explanation: "The input is bounded.", fix_recommendation: "" },
  { path: "src/data/sample-keys.js", title: "Sample key", severity: "low", rule_id: "generic-api-key", cwe: "CWE-798", tools: ["gitleaks"],
    start_line: 2, end_line: 2, message: "m", snippet: "", verdict: "likely_false_positive", explanation: "A documentation value.", fix_recommendation: "" },
].map((f, i) => toFinding({ ...f, id: `f-${String(i).padStart(6, "0")}`, file_sha256: "" } as WireFinding, "scan-1", i));
