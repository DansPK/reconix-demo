/* The optional `api_spec` on a saved assessment: older files without it still parse, and a run
   that has one reads it into its view (lib/data/adapt.ts). */
import { describe, expect, it } from "vitest";

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

describe("api_spec", () => {
  it("is optional: a file without it parses", () => {
    expect(AssessmentSchema.parse({ ...base, api_spec: undefined }).api_spec).toBeUndefined();
    expect(AssessmentSchema.parse({ ...base, api_spec: null }).api_spec).toBeNull();
  });

  it("is read when present", () => {
    const parsed = AssessmentSchema.parse({ ...base, api_spec: apiSpec });
    expect(parsed.api_spec?.endpoints).toBe(24);
    expect(assessmentView(parsed).apiSpec).toEqual({ label: "Orders API 1.2.0", endpoints: 24 });
  });

  it("refuses a malformed api_spec", () => {
    expect(() => AssessmentSchema.parse({ ...base, api_spec: { title: "x" } })).toThrow();
  });
});
