/* Reading the knowledge folder the TUI's /add-on writes (lib/assistant/knowledge/read.ts and
   schema.ts), on a temporary folder: a missing folder is no knowledge, a link or a folder others
   can write to is refused, a corrupt, foreign, linked or oversized file is skipped while the rest
   still counts, the schemas' bounds hold, and nothing is ever written. Never touches ~/.reconix. */
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { knowledgeDir } from "@/lib/assistant/knowledge/paths";
import { MAX_INDEX_BYTES, MAX_SOURCE_FILE_BYTES, readKnowledge } from "@/lib/assistant/knowledge/read";
import {
  IndexEntrySchema,
  KnowledgeIndexSchema,
  KnowledgeSourceSchema,
  MAX_CHUNK,
  MAX_CHUNKS,
  MAX_NAME,
  MAX_SOURCES,
  sourceFile,
} from "@/lib/assistant/knowledge/schema";

import { indexEntry, knowledgeId, sourceDoc, writeAtomic, writeKnowledge } from "./knowledge-fixtures";

const posix = process.platform !== "win32";
const RUNBOOK = { name: "runbook.md", chunks: ["Rotate the quokka keys every 30 days.", "Escalate to the on-call lead."] };
const POLICY = { name: "policy.pdf", chunks: ["Testing windows are agreed in writing."] };
let root = "";
let dir = "";

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "reconix-knowledge-test-"));
  dir = path.join(root, "knowledge");
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const names = async () => (await readKnowledge(dir)).sources.map((s) => s.name);
/** Every file in the folder with its size, mode and change time. */
const snapshot = () =>
  readdirSync(dir)
    .sort()
    .map((n) => {
      const s = statSync(path.join(dir, n));
      return [n, s.size, s.mode, s.mtimeMs, s.ino];
    });

describe("knowledgeDir", () => {
  it("is RECONIX_KNOWLEDGE_DIR, else ~/.reconix/knowledge", () => {
    expect(knowledgeDir({ RECONIX_KNOWLEDGE_DIR: "/srv/k" })).toBe("/srv/k");
    expect(knowledgeDir({})).toMatch(/[/\\]\.reconix[/\\]knowledge$/);
    expect(knowledgeDir({ RECONIX_KNOWLEDGE_DIR: "~/k" })).toMatch(/[/\\]k$/);
  });
});

describe("readKnowledge", () => {
  it("finds no knowledge in a missing folder, and creates nothing", async () => {
    expect(await readKnowledge(dir)).toEqual({ state: "missing", sources: [], signature: "" });
    expect(existsSync(dir)).toBe(false);
  });

  it("reads the sources in the index's order, with the index's names", async () => {
    const ids = writeKnowledge(dir, [RUNBOOK, POLICY]);
    const read = await readKnowledge(dir);
    expect(read.state).toBe("ok");
    expect(read.sources).toEqual([
      { id: ids[0], name: "runbook.md", chunks: RUNBOOK.chunks },
      { id: ids[1], name: "policy.pdf", chunks: POLICY.chunks },
    ]);
    expect(read.signature).not.toBe("");
  });

  it("has nothing in a folder without an index, or with a corrupt one", async () => {
    mkdirSync(dir, { mode: 0o700 });
    expect(await readKnowledge(dir)).toMatchObject({ state: "ok", sources: [] });
    writeKnowledge(dir, [RUNBOOK]);
    writeAtomic(path.join(dir, "index.json"), "{ not json");
    expect(await names()).toEqual([]);
    writeAtomic(path.join(dir, "index.json"), JSON.stringify({ format: "reconix.knowledge/v2", sources: [] }));
    expect(await names()).toEqual([]);
  });

  it("skips a corrupt, missing or mismatched source and keeps the others", async () => {
    const [runbook, policy] = writeKnowledge(dir, [RUNBOOK, POLICY]);
    writeAtomic(path.join(dir, `${runbook}.json`), '{"format":"reconix.knowledge.source/v1","id":');
    expect(await names()).toEqual(["policy.pdf"]);
    writeAtomic(path.join(dir, `${runbook}.json`), JSON.stringify({ ...sourceDoc(RUNBOOK), extra: 1 })); // strict: unknown key
    expect(await names()).toEqual(["policy.pdf"]);
    writeAtomic(path.join(dir, `${runbook}.json`), JSON.stringify(sourceDoc({ ...RUNBOOK, id: policy }))); // another source's file
    expect(await names()).toEqual(["policy.pdf"]);
    rmSync(path.join(dir, `${policy}.json`));
    expect(await names()).toEqual([]);
  });

  it("counts a source listed twice once", async () => {
    writeKnowledge(dir, [RUNBOOK]);
    const entry = indexEntry(RUNBOOK);
    writeAtomic(path.join(dir, "index.json"), JSON.stringify({ format: "reconix.knowledge/v1", sources: [entry, entry] }));
    expect(await names()).toEqual(["runbook.md"]);
  });

  it("refuses files over their caps", async () => {
    const [runbook] = writeKnowledge(dir, [RUNBOOK, POLICY]);
    writeAtomic(path.join(dir, `${runbook}.json`), JSON.stringify(sourceDoc(RUNBOOK)) + " ".repeat(MAX_SOURCE_FILE_BYTES));
    expect(await names()).toEqual(["policy.pdf"]);
    const index = JSON.stringify({ format: "reconix.knowledge/v1", sources: [indexEntry(RUNBOOK), indexEntry(POLICY)] });
    writeAtomic(path.join(dir, "index.json"), index + " ".repeat(MAX_INDEX_BYTES));
    expect(await names()).toEqual([]);
  });

  it("sees a replaced file, and reads an unchanged one again from memory", async () => {
    writeKnowledge(dir, [RUNBOOK]);
    expect((await readKnowledge(dir)).sources[0].chunks).toEqual(RUNBOOK.chunks);
    const first = (await readKnowledge(dir)).signature;
    expect((await readKnowledge(dir)).signature).toBe(first);
    writeKnowledge(dir, [{ ...RUNBOOK, chunks: ["Rotate the quokka keys every 7 days."] }]);
    const again = await readKnowledge(dir);
    expect(again.sources[0].chunks).toEqual(["Rotate the quokka keys every 7 days."]);
    expect(again.signature).not.toBe(first);
  });

  it.runIf(posix)("refuses a folder that is a symlink", async () => {
    const real = path.join(root, "elsewhere");
    writeKnowledge(real, [RUNBOOK]);
    symlinkSync(real, dir);
    expect(await readKnowledge(dir)).toMatchObject({ state: "refused", sources: [] });
  });

  it.runIf(posix)("refuses a folder others can write to, and leaves it as it is", async () => {
    writeKnowledge(dir, [RUNBOOK]);
    for (const mode of [0o770, 0o702, 0o720]) {
      chmodSync(dir, mode);
      expect(await readKnowledge(dir)).toMatchObject({ state: "refused", sources: [] });
      expect(statSync(dir).mode & 0o777).toBe(mode); // never tightened: the dashboard doesn't write here
    }
    chmodSync(dir, 0o750); // readable by the group is fine
    expect(await names()).toEqual(["runbook.md"]);
  });

  it.runIf(posix)("refuses a folder that is a file", async () => {
    writeFileSync(dir, "{}");
    expect((await readKnowledge(dir)).state).toBe("refused");
  });

  it.runIf(posix)("skips a linked index or source, and a file others can write to", async () => {
    const [runbook, policy] = writeKnowledge(dir, [RUNBOOK, POLICY]);
    const outside = path.join(root, "outside.json");
    writeAtomic(outside, JSON.stringify(sourceDoc(RUNBOOK)));
    rmSync(path.join(dir, `${runbook}.json`));
    symlinkSync(outside, path.join(dir, `${runbook}.json`));
    expect(await names()).toEqual(["policy.pdf"]);

    chmodSync(path.join(dir, `${policy}.json`), 0o620);
    expect(await names()).toEqual([]);
    chmodSync(path.join(dir, `${policy}.json`), 0o644); // readable by others is fine
    expect(await names()).toEqual(["policy.pdf"]);

    const index = path.join(dir, "index.json");
    const linked = path.join(root, "index.json");
    writeAtomic(linked, JSON.stringify({ format: "reconix.knowledge/v1", sources: [indexEntry(POLICY)] }));
    rmSync(index);
    symlinkSync(linked, index);
    expect(await names()).toEqual([]);
  });

  it("never writes: every file, mode and time is unchanged after reading", async () => {
    const [runbook] = writeKnowledge(dir, [RUNBOOK, POLICY]);
    writeAtomic(path.join(dir, `${runbook}.json`), "corrupt");
    if (posix) chmodSync(dir, 0o755);
    const before = snapshot();
    const dirMode = statSync(dir).mode;
    await readKnowledge(dir);
    await readKnowledge(dir);
    expect(snapshot()).toEqual(before);
    expect(statSync(dir).mode).toBe(dirMode);
  });
});

describe("the files' schemas", () => {
  const entry = indexEntry(RUNBOOK);
  const index = (sources: unknown[]) => ({ format: "reconix.knowledge/v1", sources });
  const source = (over: Record<string, unknown>) => ({ ...sourceDoc(RUNBOOK), ...over });

  it(`holds at most ${MAX_SOURCES} sources`, () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...entry, id: knowledgeId(`f${i}`) }));
    expect(KnowledgeIndexSchema.safeParse(index(many(MAX_SOURCES))).success).toBe(true);
    expect(KnowledgeIndexSchema.safeParse(index(many(MAX_SOURCES + 1))).success).toBe(false);
  });

  it("checks each index entry strictly", () => {
    expect(IndexEntrySchema.safeParse(entry).success).toBe(true);
    for (const bad of [
      { id: "ABC" },
      { id: "0".repeat(31) },
      { id: `${"0".repeat(31)}g` },
      { name: "" },
      { name: "n".repeat(MAX_NAME + 1) },
      { kind: "exe" },
      { bytes: -1 },
      { bytes: 1.5 },
      { chunks: MAX_CHUNKS + 1 },
      { added_at: "yesterday" },
      { added_at: "2026-10-22T09:30:00+07:00" },
      { path: "/home/me/runbook.md" },
    ]) {
      expect(IndexEntrySchema.safeParse({ ...entry, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
    for (const fine of ["2026-10-22T09:30:00Z", "2026-10-22T09:30:00.123456+00:00", "2026-10-22T09:30:00+00:00"]) {
      expect(IndexEntrySchema.safeParse({ ...entry, added_at: fine }).success, fine).toBe(true);
    }
  });

  it(`holds at most ${MAX_CHUNKS} passages of ${MAX_CHUNK} characters, counted as Python counts them`, () => {
    expect(KnowledgeSourceSchema.safeParse(source({ chunks: Array(MAX_CHUNKS).fill("x") })).success).toBe(true);
    expect(KnowledgeSourceSchema.safeParse(source({ chunks: Array(MAX_CHUNKS + 1).fill("x") })).success).toBe(false);
    expect(KnowledgeSourceSchema.safeParse(source({ chunks: ["x".repeat(MAX_CHUNK)] })).success).toBe(true);
    expect(KnowledgeSourceSchema.safeParse(source({ chunks: ["x".repeat(MAX_CHUNK + 1)] })).success).toBe(false);
    expect(KnowledgeSourceSchema.safeParse(source({ chunks: ["\u{1F600}".repeat(MAX_CHUNK)] })).success).toBe(true); // 2,400 UTF-16 units
    expect(KnowledgeSourceSchema.safeParse(source({ chunks: ["\u{1F600}".repeat(MAX_CHUNK + 1)] })).success).toBe(false);
    expect(KnowledgeSourceSchema.safeParse(source({ format: "reconix.knowledge/v1" })).success).toBe(false);
    expect(KnowledgeSourceSchema.safeParse(source({ id: "../index" })).success).toBe(false);
    expect(KnowledgeSourceSchema.safeParse(source({ chunks: [1] })).success).toBe(false);
  });

  it("builds a file name from a checked id only", () => {
    expect(sourceFile(knowledgeId("x"))).toMatch(/^[0-9a-f]{32}\.json$/);
    expect(() => sourceFile("../../etc/passwd")).toThrow();
  });
});
