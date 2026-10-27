/* maskDeep / maskAssessment (lib/report/mask.ts): strings are masked, shapes are kept. Lists of
   strings are masked as one text: redact-list-vectors.json holds cases the TUI's redact_all
   (reconix/store/redact.py) checks too, so the two stay in step. */
import { describe, expect, it } from "vitest";

import { AssessmentSchema } from "@/lib/data/schema";
import { DEFAULT_COMBINE_OPTIONS } from "@/lib/report/combined/options";
import { combineAssessments } from "@/lib/report/combined/select";
import { maskAssessment, maskDeep } from "@/lib/report/mask";

import { sampleAssessments } from "./fixtures";
import listVectors from "./redact-list-vectors.json";

describe("maskDeep", () => {
  it.each(listVectors as [string[], string[]][])("masks the list %j as the TUI does", (list, masked) => {
    expect(maskDeep(list)).toEqual(masked);
  });

  it("keeps an empty list empty (it is no list holding one empty string)", () => {
    expect(maskDeep({ plan: [], cwe: [], nested: { rows: [] } })).toEqual({ plan: [], cwe: [], nested: { rows: [] } });
  });

  it("masks a login in a URL inside a string and inside a list of strings", () => {
    expect(maskDeep("open https://admin:hunter2@app.example.com/x")).toContain("••••@app.example.com");
    expect(maskDeep(["https://admin:hunter2@app.example.com/x", "plain"])).toEqual(["https://••••@app.example.com/x", "plain"]);
  });

  it("keeps an element holding newlines as one element", () => {
    expect(maskDeep(["one\ntwo", "password=hunter2\nthree"])).toEqual(["one\ntwo", "password=••••\nthree"]);
    expect(maskDeep(["a\n", "", "\nb"])).toEqual(["a\n", "", "\nb"]);
  });

  it("masks a value at an element's end without reading into the next element", () => {
    expect(maskDeep(["password=hunter2", "x", "Cookie: sid=1", "kept"])).toEqual(["password=••••", "x", "Cookie: ••••", "kept"]);
  });

  it("catches a private key spread over several elements as one block", () => {
    const lines = ["-----BEGIN RSA PRIVATE KEY-----", "MIIEowIBAAKCAQEA", "-----END RSA PRIVATE KEY-----", "after"];
    const masked = maskDeep(lines);
    expect(masked.join("\n")).not.toContain("MIIEowIBAAKCAQEA");
    expect(masked).toEqual(["•••• (private key)", "after"]);
  });

  it("works whatever the elements hold, even the separator's own characters", () => {
    const odd = ["x\n\u0000\ny", "\u0000", "password=hunter2"];
    expect(maskDeep(odd)).toEqual(["x\n\u0000\ny", "\u0000", "password=••••"]);
    // the separator formed across a boundary by the join
    expect(maskDeep(["a\n\u0000", "x"])).toEqual(["a\n\u0000", "x"]);
    expect(maskDeep(["a\n", "\u0000\nx"])).toEqual(["a\n", "\u0000\nx"]);
    expect(maskDeep(["a\n\u0000", "\n\u0000\nx", "password=hunter2"])).toEqual(["a\n\u0000", "\n\u0000\nx", "password=••••"]);
    expect(maskDeep(["a\n\u00000", "\u00000\u0000\nx", "\u00001\u0000"])).toEqual(["a\n\u00000", "\u00000\u0000\nx", "\u00001\u0000"]);
  });
});

describe("a run that stopped before its scope (no scope, no plan, no findings)", () => {
  const stopped = sampleAssessments().find((a) => a.scope === null && a.plan.length === 0)!;

  it("is in the sample data, and masking leaves its lists empty", () => {
    expect(stopped).toBeDefined();
    const masked = maskAssessment(AssessmentSchema.parse(stopped));
    expect(masked.findings).toEqual([]);
    expect(masked.plan).toEqual([]);
    expect(masked.approvals).toEqual([]);
  });

  it("combines into a report that lists the missing scope", () => {
    const report = combineAssessments([maskAssessment(stopped)], DEFAULT_COMBINE_OPTIONS);
    expect(report.summary.occurrences).toBe(0);
    expect(report.limitations.some((l) => l.text.includes("no Scope Manifest saved"))).toBe(true);
  });
});
