// Prints every value the dashboard derives from one saved assessment, to check by eye against
// the JSON file. Run from the site's folder:
//   node scripts/check-dashboard-data.mjs                  # newest file in sample-data/
//   node scripts/check-dashboard-data.mjs path/to/file.json
//   node scripts/check-dashboard-data.mjs --all [folder]   # the every-run Overview
// scripts/ts-hooks.mjs lets plain node import the TypeScript sources (no build step).
import { readdirSync, readFileSync } from "node:fs";
import { register } from "node:module";
import { join, resolve as rpath } from "node:path";
import { pathToFileURL } from "node:url";

register("./ts-hooks.mjs", import.meta.url);
const srcUrl = pathToFileURL(rpath(process.cwd(), "src")).href;

const { deriveOverall } = await import(`${srcUrl}/components/dashboard/derive-overall.ts`);
const line = (k, v) => console.log(`  ${k.padEnd(22)} ${v}`);
const summary = (s) => {
  console.log("== Summary strip ==");
  line("Findings", `${s.findings.total} · worst ${s.findings.worst ? `${s.findings.worst.level} ×${s.findings.worst.count}` : "none"} · ${s.findings.needsReview} need review`);
  line("Assessment progress", `${s.progress.pct}% · ${s.progress.caption}${s.progress.status ? ` · ${s.progress.status}` : ""}${s.progress.other ? ` · ${s.progress.other.count} ${s.progress.other.status}` : ""}`);
  line("Tool execution", `${s.tools.steps} steps · tools ${s.tools.tools.join(", ") || "none"} · ${s.tools.caption}${s.tools.running ? " · running" : ""}`);
  line("Duration", `${s.duration.value}${s.duration.meter ? ` · ${Math.round(s.duration.meter.frac * 100)}% of the limit` : " · no limit"}${s.duration.over ? ` · ${s.duration.over} over the limit` : ""}`);
};

if (process.argv[2] === "--all") {
  const dir = process.argv[3] ?? "sample-data";
  const { AssessmentSchema } = await import(`${srcUrl}/lib/data/schema.ts`);
  const { assessmentView } = await import(`${srcUrl}/lib/data/adapt.ts`);
  const { markIdle, STALE_AFTER_HOURS } = await import(`${srcUrl}/lib/data/stats.ts`);
  const hours = Number(process.env.RECONIX_STALE_AFTER_HOURS ?? STALE_AFTER_HOURS); // as the page reads them
  const views = readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .map((n) => AssessmentSchema.safeParse(JSON.parse(readFileSync(join(dir, n), "utf8"))))
    .filter((r) => r.success)
    .map((r) => assessmentView(markIdle(r.data, Date.now(), hours * 3_600_000)))
    .sort((a, b) => b.createdMs - a.createdMs);
  if (!views.length) {
    console.error(`${dir} holds no readable assessment.`);
    process.exit(1);
  }
  const o = deriveOverall(views);
  const c = o.cards;
  console.log(`\n${dir} · every run\n`);
  line("runs", `${o.runs} (${o.completed} completed, ${o.waiting} waiting)`);
  summary(c.summary);
  line("severity", c.findings.words);
  line("review", `${c.findings.review.confirmed} confirmed · ${c.findings.review.needsReview} need review · ${c.findings.review.closed} closed`);
  c.findings.top.forEach((f) => line(f.id, `${f.score} · ${f.severity} · ${f.title} · ${f.run}`));
  console.log("\n== Activity: runs per " + c.activity.unit + " ==");
  line("window", `${c.activity.window} · count axis ${c.activity.yTicks.join(" ")}`);
  c.activity.days.filter((d) => d.total).forEach((d) => line(d.label, `${d.total} · ${d.segments.map((s) => `${s.status} ${s.count}`).join(", ")}`));
  console.log("\n== Execution: " + c.execution.caption + " ==");
  c.execution.runs.forEach((r) => line(`${r.id} ${r.when}`, `${r.status} · ${r.progress}% · ${r.steps.done}/${r.steps.total} steps · ${r.findings} findings`));
  console.log("\n== Statuses ==");
  o.statuses.forEach((s) => line(`  ${s.name}`, s.count));
  console.log();
  process.exit(0);
}

const file =
  process.argv[2] ??
  join(
    "sample-data",
    readdirSync("sample-data")
      .filter((n) => n.endsWith(".json"))
      .sort()
      .pop(),
  );
const { AssessmentSchema } = await import(`${srcUrl}/lib/data/schema.ts`);
const { assessmentView } = await import(`${srcUrl}/lib/data/adapt.ts`);
const { deriveDashboard } = await import(`${srcUrl}/components/dashboard/derive.ts`);

const parsed = AssessmentSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
if (!parsed.success) {
  console.error(`${file} does not match the saved-assessment format.`);
  process.exit(1);
}
const d = deriveDashboard(assessmentView(parsed.data));

console.log(`\n${file}`);
console.log("\n== Assessment ==");
for (const [k, v] of Object.entries(d.assessment)) line(k, v);

const c = d.cards;
console.log();
summary(c.summary);

console.log("\n== Findings / severity ==");
line("findingTotal", d.findingTotal);
c.findings.severity.forEach((x) => line(x.level, `count ${x.count} · share ${x.share}%`));
line("review", `${c.findings.review.confirmed} confirmed · ${c.findings.review.needsReview} need review · ${c.findings.review.closed} closed`);
c.findings.top.forEach((f) => line(f.id, `${f.score} · ${f.severity} · ${f.title}`));

console.log("\n== Policy / run ==");
line("checks", `${d.checks.allowed} allowed / ${d.checks.total} (${d.checks.blocked} blocked)`);
line("maskedSecrets", d.maskedSecrets);
line("requests", d.requests);
line("minutes", `${d.minutes.used} / ${d.minutes.max ?? "no limit"}${d.minutes.over ? " (over)" : ""}`);
line("planSteps", `${d.planSteps.done} / ${d.planSteps.total}`);
d.phases.forEach((p) => line(`  ${p.key}`, `${p.pct}% · ${p.status}`));
line("gate", d.gate ? `[${d.gate.time}] ${d.gate.text}` : "none");

console.log("\n== Activity lanes ==");
line("window", `${c.activity.window} · ticks ${c.activity.ticks.map((t) => t.label).join(" ")}`);
c.activity.lanes.forEach((l) =>
  line(l.label, `${l.count} events · ${l.marks.map((m) => `${m.start.toFixed(2)}${m.count > 1 ? `×${m.count}` : ""}${m.pending ? "(waits)" : ""}`).join(" ") || "—"}`),
);

console.log("\n== Execution ==");
line("caption", c.execution.caption);
c.execution.tools.forEach((t) => line(t.label, `${t.start.toFixed(2)} → ${t.end.toFixed(2)} · ${t.steps} steps${t.live ? " (live)" : ""}`));
line("gate", c.execution.gate ? `${c.execution.gate.meaning.label} @${c.execution.gate.pos?.toFixed(2) ?? "—"} · ${c.execution.gate.text}` : "none");
console.log();
