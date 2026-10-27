/* The reply cards (lib/assistant/cards.ts), the intent rules behind them (intent.ts) and the
   welcome suggestions (prompts.ts), on the sample data: every card passes the shared schema,
   holds the saved numbers, and the model is only told which cards are shown. */
import { describe, expect, it } from "vitest";

import { approvalsCard, cardNotes, NOTICES, pickCards, STATE_ORDER, toolGroups } from "@/lib/assistant/cards";
import { rankFindings, scopedViews } from "@/lib/assistant/insights";
import { readIntent } from "@/lib/assistant/intent";
import { welcomePrompts } from "@/lib/assistant/prompts";
import { type Card, CardSchema } from "@/lib/assistant/protocol";
import { MASK } from "@/lib/assistant/redact";
import { assessmentView } from "@/lib/data/adapt";
import { type Assessment, STATUSES } from "@/lib/data/schema";

import { sampleAssessments } from "./fixtures";

const samples = sampleAssessments();
const views = samples.map(assessmentView);
const waiting = samples.find((a) => a.status === "Awaiting input")!;
const completed = samples.find((a) => a.status === "Completed")!;
const kinds = (cards: Card[]) => cards.map((c) => c.kind);
const of = <K extends Card["kind"]>(cards: Card[], kind: K) => cards.find((c): c is Extract<Card, { kind: K }> => c.kind === kind)!;
const real = (a: Assessment) => a.findings.filter((f) => f.status !== "false-positive");

describe("readIntent", () => {
  it.each([
    ["Analyze the current findings", ["findings"]],
    ["Explain the top finding", ["top", "findings"]],
    ["Review the assessment progress", ["progress"]],
    ["What waits on my approval?", ["approvals"]],
    ["Generate a report", ["report"]],
    ["Plan a security assessment", ["plan"]],
    ["Which tools ran?", ["tools"]],
    ["What did the policy block?", ["policy"]],
    ["Approve the pending action", ["act", "approvals"]],
    ["Run nmap against 192.0.2.10", ["run"]],
    ["scan example.com now", ["run"]],
    ["hello there", []],
    // ordinary questions that only look like planning or running
    ["Which findings are new in this assessment?", ["findings"]],
    ["Show me the new findings in the latest assessment", ["findings"]],
    ["How do I see which tools were used?", ["tools"]],
    ["What tools do you have?", ["tools"]],
    ["Create a report for the latest assessment", ["report"]],
    // the three formats by name, a Word file without the word "report", and the gone ones still ask
    ["Can I get it as a docx?", ["report"]],
    ["Send me the Word document", ["report"]],
    ["Is there a word file of this?", ["report"]],
    ["Give me the JSON", ["report"]],
    ["Where is the SARIF?", ["report"]],
    ["The word count is high", []],
    ["What is the status of the scan?", ["progress"]],
    ["Did the run finish?", ["progress"]],
    ["Was anything blocked by the policy?", ["policy"]],
    ["Thanks, that helps", []],
    // and real ones
    ["Start a new assessment on example.com", ["plan"]],
    ["I need another pentest next week", ["plan"]],
    ["Set up a web assessment for staging", ["plan"]],
    ["Can you run a scan on the staging site?", ["run"]],
    ["Please execute sqlmap on /login", ["run"]],
    // tool results, recorded decisions, policy restrictions and errors
    ["Show the tool results", ["tools"]],
    ["What were the results of Nuclei?", ["tools"]],
    ["How many requests were made?", ["tools"]],
    ["Which checks were run by Semgrep?", ["tools"]],
    ["Which actions were rejected?", ["approvals"]],
    ["Was the HIGH-risk action double-checked?", ["findings", "approvals"]], // "risk" is findings vocabulary too
    ["Which gated actions needed authorization?", ["findings", "approvals"]], // authorization: a weakness class too
    ["Who signed off on the risky actions?", ["approvals"]],
    ["What restrictions did the scope put on the run?", ["policy"]],
    ["Was any request disallowed or not allowed?", ["policy"]],
    ["List the policy verdicts", ["policy"]],
    ["Which paths were excluded?", ["policy"]],
    ["Were there any errors in the run?", ["errors"]],
    ["Did anything fail or crash during the scan?", ["errors"]],
    ["What went wrong in the last run?", ["errors"]],
    ["Why did the run fail?", ["errors"]],
    ["Did a tool crash?", ["tools", "errors"]],
    // errors are about the run itself: never a finding's vocabulary, never without the run
    ["Were there any errors?", []],
    ["Which finding is about the failed login?", ["findings"]],
    ["Is there a login failure in the findings?", ["findings"]],
    ["Show broken access control findings", ["findings"]],
    ["Which findings expose a stack trace?", ["findings"]],
    ["Is there error-based SQL injection?", ["findings"]],
    ["Is there verbose error message disclosure?", ["findings"]],
    ["Show insecure authorization findings", ["findings"]],
    ["Which findings are rejected as false positives?", ["findings"]],
    ["Any restricted admin endpoints exposed?", ["findings"]],
    ["What is the output encoding issue?", ["findings"]],
    ["Did the scan find an authentication weakness?", ["findings"]],
  ])("%s → %j", (question, intents) => {
    expect(readIntent(question).intents).toEqual(intents);
  });
  it("finds finding ids, not the number inside a run label", () => {
    expect(readIntent("Explain F-002 and imp-1 in RCX-DEMO-001").findingIds).toEqual(["F-2", "IMP-1"]);
  });
});

describe("pickCards", () => {
  it("builds findings from the saved data, worst first, without false positives", () => {
    const cards = pickCards(samples, null, "Analyze the current findings");
    expect(kinds(cards)).toEqual(["findings"]);
    const card = of(cards, "findings");
    expect(card.total).toBe(samples.reduce((n, a) => n + real(a).length, 0));
    expect(Object.keys(card.counts)).toEqual(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
    for (const s of ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const) {
      expect(card.counts[s]).toBe(samples.reduce((n, a) => n + real(a).filter((f) => (f.effective_severity || f.severity) === s).length, 0));
    }
    const top = rankFindings(scopedViews(views, null))[0];
    expect(card.items[0]).toMatchObject({ id: top.finding.id, severity: top.finding.severity, run: { uid: top.view.uid } });
    expect(card.items.length).toBeLessThanOrEqual(5);
  });
  it("explains the same top finding the welcome suggestion names", () => {
    for (const uid of [null, completed.uid]) {
      const scoped = scopedViews(views, uid);
      const suggestion = welcomePrompts(scoped).find((p) => p.kind === "top")!;
      const card = of(pickCards(samples, uid, suggestion.question), "finding");
      expect(suggestion.detail.startsWith(card.item.id)).toBe(true);
      const top = rankFindings(scoped)[0];
      expect(card.item.id).toBe(top.finding.id);
      expect(card.item.run.uid).toBe(top.view.uid);
    }
  });
  it("shows a finding named by id", () => {
    const card = of(pickCards(samples, completed.uid, "Explain F-002 please"), "finding");
    expect(card.item.id).toBe("F-002");
    expect(card.item.run.uid).toBe(completed.uid);
  });
  it("shows plan progress with the saved phase states", () => {
    const card = of(pickCards(samples, waiting.uid, "Review the assessment progress"), "progress");
    expect(card.runs).toHaveLength(1);
    expect(card.runs[0].phases.map((p) => p.status)).toEqual(waiting.plan.map((p) => p.status));
    expect(card.runs[0].status).toBe("Awaiting input");
  });
  it("lists approvals, the waiting one first, and says nothing can be approved here", () => {
    const card = of(pickCards(samples, null, "What waits on my approval?"), "approvals");
    expect(card.pending).toBe(1);
    expect(card.items[0]).toMatchObject({ state: "PENDING", run: { uid: waiting.uid } });
    const asked = pickCards(samples, null, "Approve the pending action");
    expect(kinds(asked)).toEqual(["notice", "approvals"]);
    expect(of(asked, "notice")).toEqual(NOTICES.act);
  });
  it("shows policy blocks, masked again", () => {
    const leaky = { ...completed, verdicts: [{ method: "GET", path: "/x?password=hunter2", allowed: false, reason: "Path outside approved scope", at: null }] };
    const card = of(pickCards([leaky], null, "What did the policy block?"), "policy");
    expect(card.blocked).toBe(1);
    expect(card.items[0].text).toContain(MASK);
    expect(card.items[0].text).not.toContain("hunter2");
    expect(card.items[0].time).toBe("—");
  });
  it("shows tool steps from the log", () => {
    const card = of(pickCards(samples, completed.uid, "Which tools ran?"), "tools");
    const toolLines = assessmentView(completed).log.filter((l) => l.kind === "tool");
    expect(card.runs[0].total).toBe(toolLines.length);
    expect(card.runs[0].steps[0].time).toBe(toolLines[0].t);
    expect(card.runs[0].requests).toBe(completed.run.requests);
  });
  it("names each step's tool from the approved scope, and groups the steps by tool", () => {
    const card = of(pickCards(samples, completed.uid, "Show the tool results"), "tools");
    const tools = new Set(completed.scope!.tools);
    for (const s of card.runs[0].steps) expect(s.tool === "—" || tools.has(s.tool)).toBe(true);
    const named = card.runs[0].steps.filter((s) => s.tool !== "—");
    expect(named.length).toBeGreaterThan(0);
    const groups = toolGroups(card.runs[0].steps);
    expect(groups.reduce((n, g) => n + g.steps, 0)).toBe(card.runs[0].steps.length);
    for (const g of groups) expect(g.steps).toBe(card.runs[0].steps.filter((s) => s.tool === g.tool).length);
    expect(groups.at(-1)!.tool).toBe("—"); // lines that name no tool come last
    expect(toolGroups([{ tool: "b" }, { tool: "a" }, { tool: "—" }, { tool: "a" }])).toEqual([
      { tool: "a", steps: 2 },
      { tool: "b", steps: 1 },
      { tool: "—", steps: 1 },
    ]);
    expect(toolGroups([])).toEqual([]);
  });
  it("records every approval's decision as the saved data has it, and counts every state on the server", () => {
    const states = new Set<string>();
    for (const a of samples) {
      const card = of(pickCards(samples, a.uid, "Which actions were approved or rejected?"), "approvals");
      const view = assessmentView(a);
      expect(card.items.map((i) => [i.id, i.state])).toEqual(
        [...view.approvals].sort((x, y) => STATE_ORDER.indexOf(x.state) - STATE_ORDER.indexOf(y.state)).map((x) => [x.id, x.state]),
      );
      for (const i of card.items) states.add(i.state);
      expect(card.counts).toBeDefined();
      for (const state of STATE_ORDER) expect(card.counts![state]).toBe(view.approvals.filter((x) => x.state === state).length);
      expect(card.more).toBe(0);
    }
    expect([...states]).toEqual(expect.arrayContaining(["APPROVED", "PENDING", "REJECTED"])); // what the sample data holds (and NOT REACHED)
  });
  it("keeps the counts whole when the rows are cut: a rejected decision sorts last and drops first", () => {
    const all = views.flatMap((v) => v.approvals);
    expect(all.length).toBeGreaterThan(6); // every run: 12 in the sample data
    const rejected = all.filter((a) => a.state === "REJECTED").length;
    expect(rejected).toBeGreaterThan(0);
    const card = of(pickCards(samples, null, "Which actions were rejected?"), "approvals");
    expect(card.items).toHaveLength(6);
    expect(card.more).toBe(all.length - 6);
    expect(card.items.at(-1)!.state).not.toBe("REJECTED"); // cut from the rows…
    expect(card.counts!.REJECTED).toBe(rejected); // …but counted
    expect(Object.values(card.counts!).reduce((n, c) => n + c, 0)).toBe(all.length);
    for (const i of card.items) expect(i.risk).toMatch(/^(LOW|MEDIUM|HIGH)$/);
  });
  it("lists each policy restriction with its reason, masked", () => {
    const verdicts = [
      { method: "GET", path: "/admin", allowed: false, reason: "Path outside approved scope", at: null },
      { method: "POST", path: "/login?token=abc123secret", allowed: false, reason: "Method not allowed: token=abc123secret", at: null },
      { method: "GET", path: "/api/orders", allowed: true, reason: "Inside scope", at: null },
    ];
    const card = of(pickCards([{ ...completed, verdicts }], null, "What restrictions did the policy apply?"), "policy");
    expect(card.checks).toBe(3);
    expect(card.blocked).toBe(2);
    expect(card.items[0]).toMatchObject({ text: "GET /admin · Path outside approved scope", method: "GET", path: "/admin", reason: "Path outside approved scope" });
    expect(card.items[1].method).toBe("POST");
    expect(card.items[1].path).toContain(MASK);
    expect(card.items[1].reason).toContain("Method not allowed");
    expect(card.items[1].reason).toContain(MASK);
    for (const field of [card.items[1].text, card.items[1].path, card.items[1].reason]) expect(field).not.toContain("abc123secret");
  });
  it("answers a question about errors with what the data records: no error log, the runs' states", () => {
    const cards = pickCards(samples, null, "Were there any errors in the runs?");
    expect(kinds(cards)).toEqual(["notice", "progress"]);
    expect(of(cards, "notice")).toEqual(NOTICES.errors);
    expect(NOTICES.errors.body).toContain("no error log");
    expect(NOTICES.errors.action).toBeNull();
    const withProgress = pickCards(samples, completed.uid, "What is the status of the run, did anything fail?");
    expect(kinds(withProgress)).toEqual(["notice", "progress"]); // the notice first, the progress card once
    expect(pickCards(samples, null, "Which finding is about the failed login?").map((c) => c.kind)).toEqual(["findings"]);
  });
  it("stays true: the data has no error or failed state, tone or log kind (else the notice must go)", () => {
    const noError = (value: string) => expect(value).not.toMatch(/error|fail/i);
    for (const status of STATUSES) noError(status);
    for (const a of samples) {
      noError(a.status);
      for (const e of a.timeline) noError(e.tone);
      for (const p of a.plan) noError(p.status);
    }
    for (const v of views) for (const l of v.log) noError(l.kind);
    for (const label of ["Not started", "Running", "Waiting for you", "Completed", "Stopped", "Interrupted"]) expect(NOTICES.errors.body.toLowerCase()).toContain(label.split(" ")[0].toLowerCase());
  });
  it("offers one run's downloads, or asks which run", () => {
    expect(of(pickCards(samples, completed.uid, "Generate a report"), "report").runs).toHaveLength(1);
    const all = of(pickCards(samples, null, "Generate a report"), "report");
    // the card lists the newest runs (it caps the list), in the views' order
    expect(all.runs.length).toBeGreaterThan(1);
    expect(all.runs.map((r) => r.run.uid)).toEqual(scopedViews(views, null).map((v) => v.uid).slice(0, all.runs.length));
  });
  it("never answers an ordinary question about new findings or tools with a notice", () => {
    for (const q of ["Which findings are new in this assessment?", "Show me the new findings in the latest assessment"]) expect(kinds(pickCards(samples, null, q))).toEqual(["findings"]);
    expect(kinds(pickCards(samples, completed.uid, "How do I see which tools were used?"))).toEqual(["tools"]);
  });
  it("answers planning with guidance only, never a plan", () => {
    const cards = pickCards(samples, null, "Plan a security assessment");
    expect(cards).toEqual([NOTICES.plan]);
    expect(NOTICES.plan.body).toContain("no plan has been made");
    expect(NOTICES.plan.action).toBeNull(); // no button: planning is done in the TUI
    expect(kinds(pickCards(samples, null, "Run nmap against 192.0.2.10"))).toEqual(["notice"]);
  });
  it("narrows every run to the runs a question names", () => {
    const card = of(pickCards(samples, null, "How is the progress of RCX-DEMO-002?"), "progress");
    expect(new Set(card.runs.map((r) => r.run.label))).toEqual(new Set(["RCX-DEMO-002"]));
  });
  it("shows nothing for small talk, and a notice when nothing is saved", () => {
    expect(pickCards(samples, null, "hello there")).toEqual([]);
    expect(pickCards([], null, "Analyze the findings")).toEqual([NOTICES.empty]);
    expect(pickCards([], null, "thanks")).toEqual([]);
    expect(pickCards(samples, "20200101-000000-dead_NOPE-1", "Analyze the findings")).toEqual([]);
  });
  it("keeps every card within the schema and at most four per reply", () => {
    const questions = ["Summarize everything: findings, progress, tools, policy blocks, approvals and the report", ...welcomePrompts(views).map((p) => p.question)];
    for (const uid of [null, ...samples.map((a) => a.uid)]) {
      for (const q of questions) {
        const cards = pickCards(samples, uid, q);
        expect(cards.length).toBeLessThanOrEqual(4);
        for (const card of cards) expect(CardSchema.safeParse(card).success).toBe(true);
      }
    }
  });
  it("tells the model which cards are shown, not what they hold", () => {
    const cards = pickCards(samples, null, "Analyze the current findings and what waits on my approval");
    const notes = cardNotes(cards).join(" ");
    expect(notes).toContain("findings card");
    expect(notes).toContain("approvals card");
    expect(notes).not.toMatch(/\d|RCX|F-0/);
  });
  it("counts what waits for approval the same way the card does", () => {
    expect(approvalsCard(scopedViews(views, waiting.uid)).pending).toBe(1);
    expect(approvalsCard(scopedViews(views, completed.uid)).pending).toBe(0);
  });
});

describe("welcomePrompts", () => {
  it("names real numbers, and offers approvals only when something waits", () => {
    const all = welcomePrompts(scopedViews(views, null));
    expect(all.map((p) => p.kind)).toEqual(["findings", "top", "progress", "approvals", "report", "plan"]);
    const total = samples.reduce((n, a) => n + real(a).length, 0);
    expect(all[0].detail).toContain(`${total} findings`);
    expect(all.find((p) => p.kind === "progress")!.detail).toBe(`${samples.filter((a) => a.status === "Completed").length} of ${samples.length} runs completed`);
    expect(welcomePrompts(scopedViews(views, completed.uid)).map((p) => p.kind)).not.toContain("approvals");
    expect(welcomePrompts(scopedViews(views, waiting.uid)).find((p) => p.kind === "approvals")!.detail).toContain("secret_validation");
    expect(welcomePrompts([]).map((p) => p.kind)).toEqual(["plan"]);
  });
  it("leads each suggestion to its cards", () => {
    const want: Record<string, string> = { findings: "findings", top: "finding", progress: "progress", approvals: "approvals", report: "report", plan: "notice" };
    for (const p of welcomePrompts(scopedViews(views, null))) expect(kinds(pickCards(samples, null, p.question))).toContain(want[p.kind]);
  });
});

describe("saved text in labels", () => {
  it("keeps a long run id's scope label within 120 characters", async () => {
    const { scopeOf } = await import("@/lib/assistant/insights");
    const long = { ...views[0], id: "R".repeat(200) };
    const scope = scopeOf(long);
    expect(scope.label.length).toBeLessThanOrEqual(120);
    expect(scope.label.endsWith("…")).toBe(true);
  });
  it("masks and cuts what a run waits on in the welcome suggestion", () => {
    const leaky = { ...assessmentView(waiting), gate: { time: "—", text: `sign-in with password=hunter2 ${"x".repeat(300)}` } };
    const prompt = welcomePrompts([leaky]).find((p) => p.kind === "approvals")!;
    expect(prompt.detail).not.toContain("hunter2");
    expect(prompt.detail).toContain(MASK);
    expect(prompt.detail.length).toBeLessThanOrEqual(160);
  });
});
