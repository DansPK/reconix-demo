// Orchestrates collect → sync → archive → upload → scan → watch (pure Node, no vscode import).
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { createArchive } from "./archive";
import type { Backend } from "./backend/Backend";
import { countBySeverity } from "./findingsLogic";
import type { FileEntry, Finding, FindingsQuery, ScanStage, ScanSummary } from "./shared/contract";
import { collectFiles } from "./workspaceFiles";

export interface ScanFlowOptions {
  rootDir: string;
  sessionId: string;
  maxFileSizeKB: number;
  maxUploadMB: number;
  extraExcludes: string[];
  /** Workspace-relative folders or files the backend should limit the scan to. */
  paths?: string[];
  onProgress: (scan: ScanSummary) => void;
  signal?: AbortSignal;
  /** How long to wait for the backend to confirm a cancel before giving up on it. */
  cancelGraceMs?: number;
  /**
   * Called once the files are collected. Return false to stop without syncing or scanning
   * (for example: nothing changed since the last finished scan). Without it, an empty folder throws.
   */
  shouldScan?: (files: FileEntry[], fingerprint: string) => boolean;
}

/** One hash over every collected file's path and content hash: equal means nothing changed. */
export function manifestFingerprint(files: FileEntry[]): string {
  const hash = createHash("sha256");
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    hash.update(`${file.path}\0${file.sha256}\n`);
  }
  return hash.digest("hex");
}

export const DEFAULT_CANCEL_GRACE_MS = 10_000;

/**
 * Runs a whole scan and resolves with its final summary (COMPLETED, FAILED or CANCELLED), or
 * undefined when shouldScan stopped it. Aborting the signal before the scan starts rejects;
 * aborting while it runs cancels it on the backend and resolves with the CANCELLED summary.
 * Fetch findings afterwards with getFindings.
 */
export async function runScanFlow(backend: Backend, options: ScanFlowOptions): Promise<ScanSummary | undefined> {
  const { sessionId, signal } = options;
  const startedAt = new Date().toISOString();
  // Before the backend has a scan, progress is reported locally with an empty scanId.
  const reportLocal = (stage: ScanStage): void =>
    options.onProgress({ scanId: "", sessionId, status: "RUNNING", stage, progress: 0, startedAt, counts: countBySeverity([]), notes: [] });

  reportLocal("COLLECTING");
  const files = await collectFiles({
    rootDir: options.rootDir,
    maxFileSizeKB: options.maxFileSizeKB,
    extraExcludes: options.extraExcludes,
    signal,
  });
  signal?.throwIfAborted();
  if (options.shouldScan) {
    if (!options.shouldScan(files, manifestFingerprint(files))) {
      return undefined;
    }
  } else if (files.length === 0) {
    throw new Error("No files to scan in this workspace folder.");
  }

  // The server names what to upload: only ever files this sync offered (never a path it made up).
  const offered = new Set(files.map((f) => f.path));
  const missing = (await backend.syncFiles(sessionId, files)).missing.filter((p) => offered.has(p));
  signal?.throwIfAborted();

  if (missing.length > 0) {
    reportLocal("ARCHIVING");
    const workDir = await mkdtemp(path.join(tmpdir(), "reconix-scan-"));
    try {
      const archive = await createArchive(options.rootDir, missing, path.join(workDir, "workspace.tar.gz"));
      signal?.throwIfAborted();
      if (archive.sizeBytes > options.maxUploadMB * 1024 * 1024) {
        throw new Error(`The files to upload are ${Math.ceil(archive.sizeBytes / 1024 / 1024)} MB, over the ${options.maxUploadMB} MB limit (reconix.maxUploadMB).`);
      }
      reportLocal("UPLOADING");
      await backend.uploadCode(sessionId, archive.filePath, signal);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }
  signal?.throwIfAborted();

  return scanAndWatch(backend, sessionId, options);
}

/** Starts a scan of the code the session already has (synced, or cloned) and follows it to the end. */
export async function scanAndWatch(
  backend: Backend,
  sessionId: string,
  options: Pick<ScanFlowOptions, "paths" | "onProgress" | "signal" | "cancelGraceMs">,
): Promise<ScanSummary> {
  const started = await backend.startScan(sessionId, options.paths);
  const onProgress = skipRepeats(options.onProgress);
  onProgress(started);
  return watchUntilDone(backend, started, onProgress, options.signal, options.cancelGraceMs ?? DEFAULT_CANCEL_GRACE_MS);
}

/** Reads every page of a scan's findings, and how many point at no file. */
export async function fetchAllFindings(
  backend: Backend,
  scanId: string,
  query: Omit<FindingsQuery, "offset" | "limit"> = {},
): Promise<{ items: Finding[]; withoutFile: number }> {
  const items: Finding[] = [];
  for (;;) {
    const page = await backend.getFindings(scanId, { ...query, offset: items.length });
    items.push(...page.items);
    if (page.items.length === 0 || items.length >= page.total) {
      return { items, withoutFile: page.withoutFile ?? 0 };
    }
  }
}

/** A backend may report the state it already returned from startScan; pass each change once. */
function skipRepeats(onProgress: (scan: ScanSummary) => void): (scan: ScanSummary) => void {
  let last = "";
  return (scan) => {
    const key = `${scan.status}|${scan.stage}|${scan.progress}`;
    if (key !== last) {
      last = key;
      onProgress(scan);
    }
  };
}

export function watchUntilDone(
  backend: Backend,
  started: ScanSummary,
  onProgress: (scan: ScanSummary) => void,
  signal: AbortSignal | undefined,
  cancelGraceMs: number,
): Promise<ScanSummary> {
  const { scanId } = started;
  return new Promise((resolve, reject) => {
    let settled = false;
    let latest = started;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = (): void => {
      // If the backend never reports CANCELLED, stop waiting so the user can scan again.
      // Set before cancelScan: a backend may report CANCELLED synchronously inside it.
      graceTimer = setTimeout(() => {
        if (settled) return;
        const cancelled: ScanSummary = { ...latest, status: "CANCELLED", finishedAt: new Date().toISOString() };
        onProgress(cancelled);
        done(cancelled);
      }, cancelGraceMs);
      backend.cancelScan(scanId).catch(finish(reject));
    };
    const finish =
      <T>(settle: (value: T) => void) =>
      (value: T): void => {
        if (settled) return;
        settled = true;
        clearTimeout(graceTimer);
        signal?.removeEventListener("abort", onAbort);
        // watchScan may report a final state synchronously, before `watch` is assigned.
        queueMicrotask(() => watch.dispose());
        settle(value);
      };
    const done = finish(resolve);

    const watch = backend.watchScan(scanId, (scan) => {
      latest = scan;
      onProgress(scan);
      if (scan.status === "COMPLETED" || scan.status === "FAILED" || scan.status === "CANCELLED") {
        done(scan);
      }
    });
    if (signal?.aborted) {
      onAbort();
    } else {
      signal?.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/**
 * Re-runs `task` (a findings fetch) while a scan runs: at most once every `ms`, never two at once,
 * and a poke during a run runs it once more afterwards, so a busy scan doesn't flood the server.
 * `stop` drops what is waiting and waits for a running task.
 */
export function liveRefresh(task: () => Promise<void>, ms: number): { poke(): void; stop(): Promise<void> } {
  let running: Promise<void> | undefined;
  let again = false;
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const run = (): void => {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    last = Date.now();
    running = task().finally(() => {
      running = undefined;
      if (again) {
        again = false;
        poke();
      }
    });
  };
  const poke = (): void => {
    if (timer || stopped) return;
    timer = setTimeout(() => {
      timer = undefined;
      run();
    }, Math.max(0, ms - (Date.now() - last)));
  };
  return {
    poke,
    stop: async () => {
      stopped = true;
      clearTimeout(timer);
      await running;
    },
  };
}
