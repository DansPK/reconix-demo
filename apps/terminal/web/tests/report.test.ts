/* The Assessments view's rows (derive-report.ts runRow), checked against the sample files: one
   row per run, its findings (false positives left out) and its worst severity, and the RUN column
   always names the run. (The Report view reads the Core API: tests/api-reports.test.ts.) */
import { describe, expect, it } from "vitest";

import { runRow, worstOf } from "@/components/dashboard/derive-report";
import { assessmentView } from "@/lib/data/adapt";

import { sampleAssessments } from "./fixtures";

const samples = sampleAssessments();

describe("a run's row", () => {
  it("counts its findings, false positives left out, and names the worst severity", () => {
    for (const a of samples) {
      const v = assessmentView(a);
      const kept = v.findings.filter((f) => !f.falsePositive);
      const row = runRow(v);
      expect(row.uid).toBe(a.uid);
      expect(row.findings).toBe(kept.length);
      expect(row.worst).toBe(worstOf(kept.map((f) => f.severity)));
      expect(row.steps).toEqual({ done: a.plan.filter((p) => p.status === "done").length, total: a.plan.length });
    }
  });

  it("names the worst severity, including UNKNOWN and NONE, or null", () => {
    expect(worstOf(["LOW", "HIGH", "MEDIUM"])).toBe("HIGH");
    expect(worstOf(["NONE", "UNKNOWN"])).toBe("NONE");
    expect(worstOf(["NONE"])).toBe("NONE");
    expect(worstOf([])).toBeNull();
  });
});

describe("the runs table's RUN column", () => {
  it("always names the run: its id, else its label, else its uid", () => {
    const a = samples[0];
    expect(runRow(assessmentView(a)).id).toBe(a.assessment_id || a.label);
    expect(runRow(assessmentView({ ...a, assessment_id: "", label: "Lab run" })).id).toBe("Lab run");
    expect(runRow(assessmentView({ ...a, assessment_id: "", label: "" })).id).toBe(a.uid);
  });
});
