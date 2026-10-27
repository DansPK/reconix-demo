/* Reading the data folder: only well-named, regular, valid files are used. */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dataDir, loadLibrary, readAssessmentFile, shownDir, staleAfterMs } from "@/lib/data/store";

import { SAMPLE_DIR, sampleAssessments, sampleNames } from "./fixtures";

vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/lib/auth/guard", () => ({ requireSignedIn: async () => undefined }));

let dir: string;
const saved = process.env.RECONIX_DATA_DIR;
const savedStale = process.env.RECONIX_STALE_AFTER_HOURS;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "reconix-web-"));
  process.env.RECONIX_DATA_DIR = dir;
  delete process.env.RECONIX_STALE_AFTER_HOURS;
});
afterEach(() => {
  process.env.RECONIX_DATA_DIR = saved;
  if (savedStale === undefined) delete process.env.RECONIX_STALE_AFTER_HOURS;
  else process.env.RECONIX_STALE_AFTER_HOURS = savedStale;
  vi.useRealTimers();
});

describe("dataDir", () => {
  it("defaults to ~/.reconix/assessments and expands ~", () => {
    delete process.env.RECONIX_DATA_DIR;
    expect(dataDir()).toBe(path.join(homedir(), ".reconix", "assessments"));
    process.env.RECONIX_DATA_DIR = "~/elsewhere";
    expect(dataDir()).toBe(path.join(homedir(), "elsewhere"));
    expect(shownDir(path.join(homedir(), ".reconix", "assessments"))).toBe("~/.reconix/assessments");
  });
});

describe("readAssessmentFile", () => {
  it("reads a valid sample file", async () => {
    const name = sampleNames()[0];
    const result = await readAssessmentFile(SAMPLE_DIR, name);
    expect(result).not.toBeNull();
    expect("reason" in result!).toBe(false);
  });

  it.each([
    ["notes.json", "unexpected file name"],
    ["../20261005-140300-9f76_RCX-DEMO-001.json", "unexpected file name"],
  ])("refuses the name %s", async (name, reason) => {
    expect(await readAssessmentFile(dir, name)).toEqual({ file: name, reason });
  });

  it("skips broken, foreign and renamed files", async () => {
    writeFileSync(path.join(dir, "20261005-140300-aaaa_RCX-BAD-001.json"), "{ not json");
    writeFileSync(path.join(dir, "20261005-140300-bbbb_RCX-BAD-002.json"), JSON.stringify({ schema: "other" }));
    copyFileSync(path.join(SAMPLE_DIR, sampleNames()[0]), path.join(dir, "20261005-140300-cccc_RCX-BAD-003.json"));
    const reasons = await Promise.all(
      ["aaaa_RCX-BAD-001", "bbbb_RCX-BAD-002", "cccc_RCX-BAD-003"].map(
        async (n) => (await readAssessmentFile(dir, `20261005-140300-${n}.json`)) as { reason: string },
      ),
    );
    expect(reasons.map((r) => r.reason)).toEqual([
      "is not valid JSON",
      "does not match the expected format",
      "name does not match its contents",
    ]);
  });

  it("skips a file that vanished between listing and reading", async () => {
    expect(await readAssessmentFile(dir, "20261005-140300-eeee_RCX-GONE-001.json")).toBeNull();
  });

  it("does not follow symlinks", async () => {
    const name = sampleNames()[0];
    symlinkSync(path.join(SAMPLE_DIR, name), path.join(dir, name));
    expect(await readAssessmentFile(dir, name)).toEqual({ file: name, reason: "not a regular file" });
  });

  it("does not block on a FIFO named like an assessment", async () => {
    const name = "20261005-140300-ffff_RCX-FIFO-001.json";
    execFileSync("mkfifo", [path.join(dir, name)]);
    expect(await readAssessmentFile(dir, name)).toEqual({ file: name, reason: "not a regular file" });
  });
});

describe("loadLibrary", () => {
  it("returns valid assessments newest first and lists skipped files", async () => {
    for (const name of sampleNames()) copyFileSync(path.join(SAMPLE_DIR, name), path.join(dir, name));
    writeFileSync(path.join(dir, "20261005-140300-dddd_RCX-BAD-004.json"), "[]");
    writeFileSync(path.join(dir, "README.txt"), "ignored: not .json");
    writeFileSync(path.join(dir, ".20261005-140300-9f76_RCX-DEMO-001.json.123.tmp"), "half written");
    const library = await loadLibrary();
    expect(library.assessments).toHaveLength(sampleNames().length);
    const created = library.assessments.map((a) => a.created_at);
    expect(created).toEqual([...created].sort().reverse());
    expect(library.problems).toEqual([{ file: "20261005-140300-dddd_RCX-BAD-004.json", reason: "does not match the expected format" }]);
  });

  it("is empty when the folder does not exist yet", async () => {
    process.env.RECONIX_DATA_DIR = path.join(dir, "missing");
    const library = await loadLibrary();
    expect(library.assessments).toEqual([]);
    expect(library.problems).toEqual([]);
  });
});

describe("stale runs", () => {
  const HOUR = 3_600_000;

  it("reads the limit from RECONIX_STALE_AFTER_HOURS (default 12, 0 turns it off)", () => {
    expect(staleAfterMs()).toBe(12 * HOUR);
    for (const [value, hours] of [["0", 0], ["1.5", 1.5], [" 24 ", 24], ["soon", 12], ["-3", 12], ["", 12]] as const) {
      process.env.RECONIX_STALE_AFTER_HOURS = value;
      expect(staleAfterMs()).toBe(hours * HOUR);
    }
  });

  it("loads a run that went quiet as interrupted, unless that is turned off", async () => {
    for (const name of sampleNames()) copyFileSync(path.join(SAMPLE_DIR, name), path.join(dir, name));
    const waiting = sampleAssessments().find((a) => a.status === "Awaiting input")!;
    const savedAt = Date.parse(waiting.saved_at);
    const statusAt = async (now: number) => {
      vi.useFakeTimers({ toFake: ["Date"], now });
      const library = await loadLibrary();
      vi.useRealTimers();
      return library.assessments.find((a) => a.uid === waiting.uid)!.status;
    };
    expect(await statusAt(savedAt + HOUR)).toBe("Awaiting input");
    expect(await statusAt(savedAt + 13 * HOUR)).toBe("Interrupted");
    process.env.RECONIX_STALE_AFTER_HOURS = "0";
    expect(await statusAt(savedAt + 13 * HOUR)).toBe("Awaiting input");
  });
});
