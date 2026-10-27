/* The optional `api_spec` on a saved assessment: older files without it still parse, and a run
   that has one shows an "API spec" row in the Report view's Assessment card. */
import { describe, expect, it } from "vitest";

import { deriveDashboard } from "@/components/dashboard/derive";
import { reportCards } from "@/components/dashboard/derive-report";
import { assessmentView } from "@/lib/data/adapt";
import { AssessmentSchema } from "@/lib/data/schema";

import { sampleAssessments } from "./fixtures";

const base = sampleAssessments()[0];
const apiSpec = {
  title: "Orders API",
  version: "1.2.0",
  spec_version: "3.0.3",
  endpoints: 24,
  methods: ["GET", "POST"],
  servers: ["https://api.example.com/v1"],
};

const detailRows = (a: unknown) => {
  const v = assessmentView(AssessmentSchema.parse(a));
  const r = reportCards(v, deriveDashboard(v).findings, deriveDashboard(v).cards.findings);
  if (r.mode !== "run") throw new Error("expected one run");
  return r.details;
};

describe("api_spec", () => {
  it("is optional: a file without it parses and shows no row", () => {
    expect(AssessmentSchema.parse({ ...base, api_spec: undefined }).api_spec).toBeUndefined();
    expect(AssessmentSchema.parse({ ...base, api_spec: null }).api_spec).toBeNull();
    expect(detailRows({ ...base, api_spec: null }).map((d) => d.label)).not.toContain("API spec");
  });

  it("is read when present and adds a row to the Assessment card", () => {
    const parsed = AssessmentSchema.parse({ ...base, api_spec: apiSpec });
    expect(parsed.api_spec?.endpoints).toBe(24);
    expect(assessmentView(parsed).apiSpec).toEqual({ label: "Orders API 1.2.0", endpoints: 24 });
    const row = detailRows({ ...base, api_spec: apiSpec }).find((d) => d.label === "API spec");
    expect(row?.value).toBe("Orders API 1.2.0 · 24 endpoints");
  });

  it("refuses a malformed api_spec", () => {
    expect(() => AssessmentSchema.parse({ ...base, api_spec: { title: "x" } })).toThrow();
  });
});
