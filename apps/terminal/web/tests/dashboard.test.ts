/* The globe dashboard's numbers: adapt.ts (saved assessment → viewer terms), derive.ts (one run)
   and derive-overall.ts (every run), with their axis and event helpers. Pure functions, checked
   against the sample files: sums agree with the files, positions stay on the axis, no marks
   overlap, and log text is masked. */
import { describe, expect, it } from "vitest";

import {
  CLUSTER_GAP,
  cluster,
  countTicks,
  DOT_PX,
  MARK_MARGIN_PX,
  MAX_SEGMENTS,
  mergeNarrow,
  PILL_PX,
  PLOT_MIN_PX,
  type Segment,
  ticksAt,
} from "@/components/dashboard/axis";
import { deriveDashboard } from "@/components/dashboard/derive";
import { deriveOverall, LATEST_RUNS } from "@/components/dashboard/derive-overall";
import { EVENT_KIND, eventBadge, LANE_ORDER, toolsNamed } from "@/components/dashboard/event-kinds";
import type { ActivityCard, ExecutionCard } from "@/components/dashboard/overview-types";
import { tabStop } from "@/components/dashboard/use-mark-nav";
import { MASK } from "@/lib/assistant/redact";
import { assessmentView, findingView, kindOf } from "@/lib/data/adapt";
import type { Assessment, Finding, Severity } from "@/lib/data/schema";
import { APPROVAL_STATE, POLICY_DECISION, STEP_STATUS } from "@/lib/status";

import { sampleAssessments } from "./fixtures";

const samples = sampleAssessments();
const waiting = samples.find((a) => a.status === "Awaiting input")!;
// a plain run: no CRITICAL finding and no false positive (the edge-case runs are tested below)
const completed = samples.find(
  (a) => a.status === "Completed" && a.template.name === "Web URL" && a.findings.length > 0 && a.findings.every((f) => f.severity !== "CRITICAL" && f.status !== "false-positive"),
)!;
// that run with one finding of each severity and a critical false positive (built here, so the
// sample data need not hold such a run)
const everySeverity: Assessment = (() => {
  const one = (n: number, severity: Severity, status = "open"): Finding => ({ ...completed.findings[0], id: `E-${n}`, severity, severity_override: "", effective_severity: "", status });
  return { ...completed, findings: [one(1, "CRITICAL"), one(2, "HIGH"), one(3, "MEDIUM"), one(4, "LOW"), one(5, "CRITICAL", "false-positive")] };
})();
/** The levels Findings by Severity lists, in its order: the whole scale. */
const CARD = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const activityOf = (a: Assessment) => deriveDashboard(assessmentView(a)).cards.activity as Extract<ActivityCard, { mode: "events" }>;
const executionOf = (a: Assessment) => deriveDashboard(assessmentView(a)).cards.execution as Extract<ExecutionCard, { mode: "phases" }>;
const inAxis = (p: number) => p >= 0 && p <= 1;
const tools = (a: Assessment) => a.timeline.filter((e) => e.type === "activity" && e.who === "TOOL");
const line = (a: Assessment, s: number, who: string, text: string, tone = "default") => ({
  seq: s,
  at: new Date(Date.parse(a.created_at) + s * 1000).toISOString(),
  type: "activity" as const,
  who,
  kind: "line",
  text,
  tone,
  rows: [],
});

describe("kindOf", () => {
  it.each([
    [{ who: "POLICY", tone: "block", text: "Blocked: Path excluded from the review" }, "policy"],
    [{ who: "POLICY", tone: "warn", text: "Risk: HIGH · needs a double check" }, "gate"],
    [{ who: "POLICY", tone: "ok", text: "Scope check: passed" }, "scope"],
    [{ who: "TOOL", tone: "default", text: "Executing permitted scan · Semgrep" }, "tool"],
    [{ who: "USER", tone: "ok", text: "Scope approved" }, "scope"],
    [{ who: "USER", tone: "ok", text: "Approved: secret_validation (double-checked)" }, "user"],
    [{ who: "AI", tone: "default", text: "Evidence recorded (masked)" }, "mask"],
    [{ who: "AI", tone: "default", text: "Candidate F-001 · hardcoded secret" }, "finding"],
    [{ who: "SYS", tone: "default", text: "Session started · policy engine ready" }, "info"],
  ])("%o is %s", (entry, kind) => {
    expect(kindOf(entry)).toBe(kind);
  });
});

describe("findingView", () => {
  const base = waiting.findings[0];
  it("numbers ids like the TUI and splits remediation into capitalised steps", () => {
    const f = findingView({ ...base, id: "007", remediation: "rotate the key; load secrets from the environment" });
    expect(f.id).toBe("F-007");
    expect(f.remediation).toEqual(["Rotate the key", "Load secrets from the environment"]);
  });
  it("marks masked evidence and leaves unscored findings without a CVSS", () => {
    const f = findingView({ ...base, cvss_score: 0, evidence: ["GET /a", "token: •••• (masked)", "HTTP 200"] } as Finding);
    expect(f.evidence.map((e) => e.tone)).toEqual(["request", "masked", "response"]);
    expect(f.score).toBeNull();
    expect(f.rating).toBe("no CVSS");
  });
});

describe("assessmentView", () => {
  it("reads what a waiting run waits on", () => {
    const v = assessmentView(waiting);
    expect(v.unfinished).toBe(true);
    expect(v.gate?.text).toContain("awaiting approval");
    expect(v.approvals.some((p) => p.state === "PENDING")).toBe(true);
  });
  it("counts policy checks from the verdicts", () => {
    const v = assessmentView(completed);
    expect(v.checks.total).toBe(completed.verdicts.length);
    expect(v.checks.blocked).toBe(completed.verdicts.filter((x) => !x.allowed).length);
  });
  it("has no gate once the run is over", () => {
    expect(assessmentView(completed).gate).toBeNull();
  });
});

// --- axis helpers -------------------------------------------------------------------------

describe("axis helpers", () => {
  it("clusters items into windows that start more than the gap apart", () => {
    const items = [0, 0.01, 0.02, 0.3, 0.33, 0.9, 1].map((pos, i) => ({ pos, item: i }));
    const groups = cluster(items);
    expect(groups.map((g) => g.items.length)).toEqual([3, 2, 1, 1]);
    for (const g of groups) expect(g.end - g.start).toBeLessThanOrEqual(CLUSTER_GAP);
    for (let i = 1; i < groups.length; i++) expect(groups[i].start - groups[i - 1].start).toBeGreaterThan(CLUSTER_GAP);
    expect(groups.flatMap((g) => g.items)).toEqual(items.map((x) => x.item));
  });
  it("never chains a dense run of items into one group", () => {
    const dense = Array.from({ length: 400 }, (_, i) => ({ pos: i / 399, item: i }));
    expect(cluster(dense).length).toBeGreaterThanOrEqual(Math.floor(1 / CLUSTER_GAP));
  });
  it("keeps marks apart at the narrowest plot: a pill, half a dot and a margin fit the gap", () => {
    expect(CLUSTER_GAP * PLOT_MIN_PX).toBeGreaterThanOrEqual(PILL_PX + DOT_PX / 2 + MARK_MARGIN_PX);
  });
  it("merges the narrowest tool segments until they fit, keeping order and coverage", () => {
    const segs: Segment[] = Array.from({ length: 60 }, (_, i) => ({ key: String(i), tools: [`t${i % 4}`], start: i / 60, end: (i + 1) / 60, steps: 1, times: [String(i)] }));
    const out = mergeNarrow(segs);
    expect(out.length).toBe(MAX_SEGMENTS);
    expect(out.reduce((n, s) => n + s.steps, 0)).toBe(60);
    for (let i = 1; i < out.length; i++) expect(out[i].start).toBeGreaterThanOrEqual(out[i - 1].end);
  });
  it("labels ticks without repeating a label", () => {
    expect(ticksAt([0, 0.5, 1], (p) => (p < 1 ? "5 Oct" : "6 Oct")).map((t) => t.label)).toEqual(["5 Oct", "6 Oct"]);
  });
  it("puts round count ticks up to at least the maximum", () => {
    expect(countTicks(2)).toEqual({ ticks: [0, 1, 2], top: 2 });
    expect(countTicks(13)).toEqual({ ticks: [0, 5, 10, 15], top: 15 });
    expect(countTicks(0).top).toBe(1);
  });
});

describe("event badges", () => {
  const at = { who: "USER", pendingGate: false, liveTool: false, severityOf: (id: string) => (id === "F-001" ? ("HIGH" as const) : undefined) };
  const policy = { ...at, who: "POLICY" };
  const badge = (who: string, tone: string, text: string, extra: Partial<typeof at> = {}) =>
    eventBadge(kindOf({ who, tone, text }), text, { ...at, who, ...extra });
  it("reads the status a line records", () => {
    expect(eventBadge("policy", "Blocked: Path excluded", policy)).toEqual({ type: "status", meaning: POLICY_DECISION.blocked });
    expect(eventBadge("gate", "Risk: HIGH · needs a double check", { ...policy, pendingGate: true })).toEqual({ type: "status", meaning: APPROVAL_STATE.PENDING });
    expect(badge("USER", "ok", "Approved: secret_validation (double-checked)")).toEqual({ type: "status", meaning: APPROVAL_STATE.APPROVED });
    expect(badge("USER", "ok", "Scope approved")).toEqual({ type: "status", meaning: APPROVAL_STATE.APPROVED });
    expect(badge("USER", "block", "Rejected: limited_validation")).toEqual({ type: "status", meaning: APPROVAL_STATE.REJECTED });
    expect(badge("POLICY", "ok", "Scope check: passed")).toEqual({ type: "status", meaning: POLICY_DECISION.allowed });
    expect(eventBadge("scope", "Scope Manifest drafted · pending approval", { ...at, who: "AI" })).toEqual({ type: "status", meaning: EVENT_KIND.scope });
    expect(eventBadge("tool", "Executing baseline request", { ...at, who: "TOOL", liveTool: true })).toEqual({ type: "status", meaning: STEP_STATUS.active });
    expect(eventBadge("finding", "Candidate F-001 · hardcoded secret", { ...at, who: "AI" })).toEqual({ type: "severity", level: "HIGH" });
  });
  it("gives approved and rejected only to the operator's own lines", () => {
    // a line from the sample runs: the policy continuing inside the approved scope is no approval
    const line = samples.flatMap((a) => a.timeline).find((e) => e.text === "Continuing within approved scope")!;
    expect(line.who).toBe("POLICY");
    expect(badge(line.who, line.tone, line.text)).toEqual({ type: "status", meaning: EVENT_KIND.scope });
    expect(badge("AI", "default", "Scope approved by the policy engine")).not.toEqual({ type: "status", meaning: APPROVAL_STATE.APPROVED });
  });
  it("names only approved tools as tools used", () => {
    expect(toolsNamed(["Executing permitted scan · Semgrep", "Semgrep: checks", "Executing baseline request"], ["Semgrep", "gitleaks"])).toEqual(["Semgrep"]);
  });
});

// --- one run ----------------------------------------------------------------------------

describe("deriveDashboard", () => {
  it.each(samples.map((a) => [a.uid, a] as [string, Assessment]))("%s: numbers agree with the file", (_uid, a) => {
    const d = deriveDashboard(assessmentView(a));
    const real = a.findings.filter((f) => f.status !== "false-positive");
    // Findings by Severity and the summary strip count the same findings
    const activity = a.timeline.filter((e) => e.type === "activity");
    const { summary, findings } = d.cards;
    expect(d.cards.mode).toBe("run");
    expect(d.findingTotal).toBe(real.length);
    expect(summary.findings.total).toBe(real.length);
    expect(findings.total).toBe(real.length);
    expect(findings.severity.reduce((n, s) => n + s.count, 0)).toBe(real.length);
    expect(findings.review.confirmed + findings.review.needsReview + findings.review.closed).toBe(real.length);
    expect(summary.tools.steps).toBe(tools(a).length);
    expect(summary.tools.requests).toBe(a.run.requests);
    expect(summary.progress.pct).toBe(d.assessment.progress);
    expect(summary.progress.status).toBe(a.status);
    expect(d.requests).toBe(a.run.requests);
    // the raw log stays on the server: only the masked event copies reach the page
    expect(d).not.toHaveProperty("log");
    expect(d).not.toHaveProperty("window");
    // every log line is in its own kind's lane exactly once
    const lanes = activityOf(a).lanes;
    expect(lanes.map((l) => l.kind)).toEqual([...LANE_ORDER]);
    expect(lanes.reduce((n, l) => n + l.marks.reduce((m, k) => m + k.count, 0), 0)).toBe(activity.length);
    const log = assessmentView(a).log;
    expect(log).toHaveLength(activity.length);
    for (const l of lanes) expect(l.count).toBe(log.filter((x) => x.kind === l.kind).length);
    expect(executionOf(a).phases).toEqual(d.phases);
  });

  it("keeps every chart position on the axis, and no two marks of a lane overlap", () => {
    for (const a of samples) {
      const act = activityOf(a);
      const exe = executionOf(a);
      for (const l of act.lanes) {
        for (const m of l.marks) expect(inAxis(m.start) && inAxis(m.end) && m.start <= m.end && m.end - m.start <= CLUSTER_GAP).toBe(true);
        for (let i = 1; i < l.marks.length; i++) expect(l.marks[i].start - l.marks[i - 1].start).toBeGreaterThan(CLUSTER_GAP);
      }
      for (const s of exe.tools) expect(inAxis(s.start) && inAxis(s.end) && s.start <= s.end).toBe(true);
      for (let i = 1; i < exe.tools.length; i++) expect(exe.tools[i].start).toBeGreaterThanOrEqual(exe.tools[i - 1].end - 1e-9);
      expect([...act.ticks, ...exe.ticks].every((t) => inAxis(t.pos))).toBe(true);
      if (exe.gate?.pos != null) expect(inAxis(exe.gate.pos)).toBe(true);
    }
  });

  it("shows the gate a waiting run waits on, and none for a finished run", () => {
    const pending = (a: Assessment) => activityOf(a).lanes.flatMap((l) => l.marks).filter((m) => m.pending);
    expect(pending(waiting)).toHaveLength(1);
    expect(executionOf(waiting).gate?.meaning).toBe(APPROVAL_STATE.PENDING);
    expect(pending(completed)).toHaveLength(0);
    expect(executionOf(completed).gate).toBeNull();
  });

  it("gives every event a readable time, a label, a badge and masked text", () => {
    const secret = { ...completed, timeline: [...completed.timeline, line(completed, 900, "TOOL", "Executing replay · password=hunter2-abcdefghijklmnop123")] };
    const events = activityOf(secret).lanes.flatMap((l) => l.marks.flatMap((m) => m.events));
    expect(events.every((e) => e.when.length > 8 && e.label.length > 0 && e.badge)).toBe(true);
    const replay = events.find((e) => e.text.startsWith("Executing replay"))!;
    expect(replay.text).toContain(MASK);
    expect(replay.text).not.toContain("abcdefghijklmnop123");
  });

  it("asks the Ask bar's questions about what the run holds", () => {
    const q = deriveDashboard(assessmentView(waiting)).cards.ask.questions;
    expect(q[0]).toBe("What is this run waiting for?");
    expect(q.length).toBeGreaterThan(0);
    expect(q.length).toBeLessThanOrEqual(3);
    expect(deriveDashboard(assessmentView(completed)).cards.ask.questions).not.toContain("What is this run waiting for?");
  });

  it("keeps a long run readable: 400 lines 3 s apart stay many marks, ≤ 24 tool segments, its gate", () => {
    const busy = (i: number) =>
      i % 2 ? line(waiting, i * 3, "TOOL", `Executing permitted scan · tool${i % 7}`) : line(waiting, i * 3, "POLICY", "Blocked: out of scope", "block");
    const tail = waiting.timeline.slice(-3).map((e, i) => ({ ...e, at: new Date(Date.parse(waiting.created_at) + (1200 + i) * 1000).toISOString() }));
    const long = { ...waiting, timeline: [...Array.from({ length: 400 }, (_, i) => busy(i)), ...tail] };
    const act = activityOf(long);
    const exe = executionOf(long);
    const lane = (kind: string) => act.lanes.find((l) => l.kind === kind)!;
    expect(lane("tool").count).toBe(200 + tail.filter((e) => e.who === "TOOL").length);
    expect(lane("tool").marks.length).toBeGreaterThanOrEqual(10); // not one pill for the lot
    expect(lane("policy").marks.length).toBeGreaterThanOrEqual(10);
    expect(lane("tool").marks.reduce((n, m) => n + m.count, 0)).toBe(lane("tool").count);
    expect(exe.tools.length).toBeLessThanOrEqual(MAX_SEGMENTS);
    expect(exe.tools.reduce((n, s) => n + s.steps, 0)).toBe(long.timeline.filter((e) => e.type === "activity" && e.who === "TOOL").length);
    for (const l of act.lanes) for (let i = 1; i < l.marks.length; i++) expect(l.marks[i].start - l.marks[i - 1].start).toBeGreaterThan(CLUSTER_GAP);
    expect(act.lanes.flatMap((l) => l.marks).some((m) => m.pending)).toBe(true);
  });

  it("merges the same tool's back-to-back steps into one segment", () => {
    const run = {
      ...completed,
      timeline: [
        line(completed, 0, "TOOL", "Executing permitted scan · Nuclei"),
        line(completed, 10, "TOOL", "Nuclei: checks on the permitted surface"),
        line(completed, 20, "TOOL", "Executing permitted scan · OWASP ZAP"),
      ],
    };
    expect(executionOf(run).tools.map((s) => s.label)).toEqual(["Nuclei", "OWASP ZAP"]);
    expect(deriveDashboard(assessmentView(run)).cards.summary.tools.tools).toEqual(["Nuclei", "OWASP ZAP"]);
  });

  it("flags time over the scope's limit", () => {
    const late = { ...completed, run: { ...completed.run, finished_at: new Date(Date.parse(completed.run.started_at!) + 3 * 3_600_000).toISOString() } };
    const d = deriveDashboard(assessmentView(late));
    expect(d.minutes.over).toBe(true);
    expect(d.cards.summary.duration.over).toBe(1);
    expect(d.cards.summary.duration.meter).toEqual({ frac: 1, over: true });
    expect(deriveDashboard(assessmentView(completed)).cards.summary.duration.over).toBe(0);
    expect(deriveDashboard(assessmentView(completed)).cards.summary.duration.meter?.over).toBe(false);
  });

  it("draws no time axis for a run with no log yet, and says so", () => {
    const d = deriveDashboard(assessmentView({ ...completed, timeline: [] }));
    expect(activityOf({ ...completed, timeline: [] }).ticks).toEqual([]);
    expect(executionOf({ ...completed, timeline: [] }).ticks).toEqual([]);
    expect((d.cards.activity as Extract<ActivityCard, { mode: "events" }>).empty).toBeTruthy();
  });

  it("reads a run with no plan, no scope and a single log line", () => {
    const bare = { ...completed, plan: [], scope: null, findings: [], run: { ...completed.run, progress: {} }, timeline: [line(completed, 0, "SYS", "Session started · policy engine ready")] };
    const d = deriveDashboard(assessmentView(bare));
    const act = activityOf(bare);
    const exe = executionOf(bare);
    expect(act.total).toBe(1);
    expect(act.lanes.find((l) => l.kind === "info")!.marks).toHaveLength(1);
    expect(act.lanes.flatMap((l) => l.marks).every((m) => inAxis(m.start))).toBe(true);
    expect(act.empty).toBeNull();
    expect(exe.phases).toEqual([]);
    expect(exe.caption).toBe("No plan yet");
    expect(exe.tools).toEqual([]);
    expect(d.cards.summary.progress.caption).toBe("No plan yet");
    expect(d.cards.summary.tools.tools).toEqual([]);
    expect(d.cards.summary.duration.meter).toBeNull();
    expect(d.cards.summary.duration).not.toHaveProperty("caption"); // the value, a meter, a badge: no line under them
    expect(d.cards.ask.scope.ok).toBe(false);
    expect(d.cards.findings.total).toBe(0);
    expect(d.cards.findings.severity.every((x) => x.frac === 0)).toBe(true);
  });

  it("leaves false positives out of the counts, and keeps the shares whole", () => {
    const one = { ...completed, findings: completed.findings.map((f, i) => (i === 0 ? { ...f, status: "false-positive" } : f)) };
    const d = deriveDashboard(assessmentView(one));
    expect(d.findingTotal).toBe(completed.findings.length - 1);
    expect(d.cards.findings.severity.reduce((n, s) => n + s.frac, 0)).toBeCloseTo(1);
    const scores = d.cards.findings.top.map((t) => t.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  // Findings by Severity always lists CRITICAL, HIGH, MEDIUM and LOW (the whole scale), in that
  // order, each even at 0; the bar, its accessible name and the total count the four. A saved
  // INFO finding never gets here (tests/info-dropped.test.ts).
  describe("severity rows", () => {
    const rows = (a: Assessment) => deriveDashboard(assessmentView(a)).cards.findings;
    const levels = (f: ReturnType<typeof rows>) => f.severity.map((s) => s.level);
    /** The run with its first counted finding (not a false positive) moved to `level`. */
    const withOne = (level: Finding["severity"]) => {
      const at = completed.findings.findIndex((x) => x.status !== "false-positive");
      return { ...completed, findings: completed.findings.map((x, i) => (i === at ? { ...x, severity: level, effective_severity: level } : x)) };
    };

    it("lists the four levels, Critical first, with a zero where a run has none", () => {
      const f = rows(completed);
      expect(completed.findings.some((x) => x.severity === "CRITICAL")).toBe(false);
      expect(levels(f)).toEqual(CARD);
      expect(f.severity[0]).toMatchObject({ level: "CRITICAL", count: 0, share: 0 });
      expect(f.words).toBe(`0 critical, ${f.severity[1].count} high, ${f.severity[2].count} medium, ${f.severity[3].count} low`);
    });

    it("counts a critical finding on its row, and the card's total is the summary strip's", () => {
      const run = withOne("CRITICAL");
      const f = rows(run);
      expect(levels(f)).toEqual(CARD);
      expect(f.severity[0]).toMatchObject({ level: "CRITICAL", count: 1 });
      expect(f.severity.reduce((n, s) => n + s.count, 0)).toBe(f.total);
      expect(f.words.startsWith("1 critical, ")).toBe(true);
      expect(deriveDashboard(assessmentView(run)).cards.summary.findings).toMatchObject({ total: f.total, worst: { level: "CRITICAL", count: 1 } });
    });

    it("keeps the four rows at zero for a run without findings", () => {
      const none = { ...completed, findings: [] };
      const f = rows(none);
      expect(f.total).toBe(0);
      expect(levels(f)).toEqual(CARD);
      expect(f.severity.every((s) => s.count === 0 && s.share === 0 && s.frac === 0)).toBe(true);
      // a false positive is counted nowhere
      const fp = { ...completed, findings: [{ ...completed.findings[0], severity: "CRITICAL" as const, effective_severity: "CRITICAL" as const, status: "false-positive" }] };
      expect(rows(fp).severity[0]).toMatchObject({ level: "CRITICAL", count: 0 });
      expect(deriveDashboard(assessmentView(fp)).cards.summary.findings).toMatchObject({ total: 0, worst: null });
    });
  });
});

// --- every run ----------------------------------------------------------------------------

describe("deriveOverall", () => {
  const views = samples.map(assessmentView);
  const all = deriveOverall(views);
  const real = samples.flatMap((a) => a.findings).filter((f) => f.status !== "false-positive");
  const days = all.cards.activity as Extract<ActivityCard, { mode: "days" }>;
  const runs = all.cards.execution as Extract<ExecutionCard, { mode: "runs" }>;

  it("totals every saved run", () => {
    const { summary } = all.cards;
    expect(all.cards.mode).toBe("all");
    expect(all.runs).toBe(samples.length);
    expect(summary.findings.total).toBe(real.length);
    expect(all.findingTotal).toBe(real.length);
    // the card: the four levels in order, counting what the strip counts
    expect(all.cards.findings.severity.map((s) => s.level)).toEqual(CARD);
    expect(all.cards.findings.total).toBe(real.length);
    expect(all.cards.findings.severity.reduce((n, s) => n + s.count, 0)).toBe(real.length);
    expect(summary.tools.steps).toBe(samples.reduce((n, a) => n + tools(a).length, 0));
    expect(summary.tools.requests).toBe(samples.reduce((n, a) => n + a.run.requests, 0));
    expect(all.waiting).toBe(samples.filter((a) => a.status === "Awaiting input").length);
    expect(all.statuses.reduce((n, s) => n + s.count, 0)).toBe(samples.length);
  });

  it("puts no line under the Duration: the total, the longest run's meter and the runs over", () => {
    const { duration } = all.cards.summary;
    expect(duration).not.toHaveProperty("caption");
    expect(duration.value).toBeTruthy();
    expect(duration.over).toBe(views.filter((v) => v.scope && v.durationSec > v.scope.windowMinutes * 60).length);
  });

  it("shows the share of runs completed", () => {
    const done = samples.filter((a) => a.status === "Completed").length;
    expect(all.cards.summary.progress.pct).toBe(Math.round((done / samples.length) * 100));
    expect(all.cards.summary.progress.caption).toBe(`${done} of ${samples.length} runs completed`);
    expect(all.cards.summary.progress.status).toBeNull();
  });

  it("lists every run's findings once, keyed by their run", () => {
    expect(all.findings).toHaveLength(samples.reduce((n, a) => n + a.findings.length, 0));
    expect(new Set(all.findings.map((f) => f.key)).size).toBe(all.findings.length);
    expect(all.findings.every((f) => f.run && f.key === `${f.run.uid}~${f.id}`)).toBe(true);
    expect(all.cards.findings.top.every((t) => t.run !== null)).toBe(true);
  });

  it("counts the runs started per day, every day on the axis, stacked by status", () => {
    expect(days.mode).toBe("days");
    expect(days.days.reduce((n, d) => n + d.total, 0)).toBe(samples.length);
    expect(days.days.reduce((n, d) => n + d.runs.length, 0)).toBe(samples.length);
    for (const d of days.days) {
      expect(d.segments.reduce((n, s) => n + s.count, 0)).toBe(d.total);
      expect(inAxis(d.pos - d.width / 2) && inAxis(d.pos + d.width / 2)).toBe(true);
    }
    for (let i = 1; i < days.days.length; i++) expect(days.days[i].pos).toBeGreaterThan(days.days[i - 1].pos);
    expect(days.max).toBeGreaterThanOrEqual(Math.max(...days.days.map((d) => d.total)));
    expect(days.yTicks.at(-1)).toBe(days.max);
    expect(days.ticks.every((t) => inAxis(t.pos))).toBe(true);
  });

  it("lists the newest runs as execution rows", () => {
    const newest = [...views].sort((a, b) => b.createdMs - a.createdMs).slice(0, LATEST_RUNS);
    expect(runs.runs.map((r) => r.uid)).toEqual(newest.map((v) => v.uid));
    expect(runs.runs.every((r) => r.steps.done <= r.steps.total && r.progress >= 0 && r.progress <= 100)).toBe(true);
  });

  it("counts per week over a long span", () => {
    const spread = views.map((v, i) => ({ ...v, createdMs: v.createdMs + i * 30 * 86_400_000 }));
    const weeks = deriveOverall(spread).cards.activity as Extract<ActivityCard, { mode: "days" }>;
    expect(weeks.unit).toBe("week");
    expect(weeks.days.reduce((n, d) => n + d.total, 0)).toBe(spread.length);
  });

  it("groups runs by local day across midnight and daylight-saving changes", () => {
    const zone = process.env.TZ;
    process.env.TZ = "Europe/Berlin"; // DST starts 29 Mar 2026 and ends 25 Oct 2026
    try {
      const at = (iso: string) => ({ ...views[0], uid: iso, createdMs: Date.parse(iso) });
      const dayOf = (list: ReturnType<typeof at>[]) => deriveOverall(list).cards.activity as Extract<ActivityCard, { mode: "days" }>;
      // 23:30 and 00:30 local are two days, though only an hour apart
      const midnight = dayOf([at("2026-06-10T21:30:00Z"), at("2026-06-10T22:30:00Z")]);
      expect(midnight.days.map((d) => [d.label, d.total])).toEqual([["10 Jun", 1], ["11 Jun", 1]]);
      // a 23-hour and a 25-hour day keep one slot each, labelled by their own date
      const spring = dayOf([at("2026-03-28T11:00:00Z"), at("2026-03-30T10:00:00Z")]);
      expect(spring.days.map((d) => [d.label, d.total])).toEqual([["28 Mar", 1], ["29 Mar", 0], ["30 Mar", 1]]);
      // 00:30 (summer time) and 23:30 (winter time) on 25 Oct are 24 h apart and the same day
      const autumn = dayOf([at("2026-10-24T22:30:00Z"), at("2026-10-25T22:30:00Z"), at("2026-10-26T12:00:00Z")]);
      expect(autumn.days.map((d) => [d.label, d.total])).toEqual([["25 Oct", 2], ["26 Oct", 1]]);
      expect(new Set(autumn.days.map((d) => d.key)).size).toBe(autumn.days.length);
    } finally {
      if (zone === undefined) delete process.env.TZ;
      else process.env.TZ = zone;
    }
  });

  it("keeps a single run readable", () => {
    const one = deriveOverall([views[0]]);
    const oneDays = one.cards.activity as Extract<ActivityCard, { mode: "days" }>;
    expect(one.runs).toBe(1);
    expect(oneDays.days).toHaveLength(1);
    expect(oneDays.days[0].pos).toBeCloseTo(0.5);
    expect(one.cards.ask.reach).toBe("1 target");
  });
});

describe("chart tab stop", () => {
  it("keeps the remembered mark while it exists, else falls back to the first", () => {
    expect(tabStop(null, ["a", "b"])).toBe("a");
    expect(tabStop("b", ["a", "b"])).toBe("b");
    expect(tabStop("gone", ["a", "b"])).toBe("a"); // merged away by a refresh, or another run
    expect(tabStop("b", [])).toBeNull();
  });
});

describe("the run with every severity and a false positive", () => {
  const d = deriveDashboard(assessmentView(everySeverity));
  const rows = d.cards.findings;

  it("shows the four rows with Critical first, and leaves the false positive out of the total", () => {
    expect(everySeverity.findings.some((f) => f.status === "false-positive")).toBe(true);
    expect(d.findingTotal).toBe(everySeverity.findings.length - 1);
    // the card and the strip count the same findings: one at each level (the critical false
    // positive is in neither)
    expect(rows.severity.map((s) => s.level)).toEqual(CARD);
    expect(rows.severity.map((s) => s.count)).toEqual([1, 1, 1, 1]);
    expect(rows.severity.reduce((n, s) => n + s.count, 0)).toBe(d.findingTotal);
    expect(d.cards.summary.findings.worst).toEqual({ level: "CRITICAL", count: 1 });
  });
});
