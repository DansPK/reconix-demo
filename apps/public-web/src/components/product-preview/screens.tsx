import { Check, ChevronRight, Download, Info, Search, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ASSESSMENT,
  CONFIRMED,
  FEATURED,
  FINDINGS,
  FINDING_TOTAL,
  LOG,
  PLAN,
  SCOPE,
  SEVERITY,
  type LogLine,
  type LogTone,
} from "@/components/product-preview/data";
import {
  FieldLabel,
  ProgressBar,
  SeverityBadge,
  SeverityBar,
  TerminalWindow,
  ViewerWindow,
} from "@/components/product-preview/window";

/**
 * The five product screens shown by ProductTabs. Pure markup (server components),
 * all fed by product-preview/data.ts. Decorative copies of the UI: the tab captions
 * carry the meaning for assistive tech.
 */

const card = "rounded-lg border border-border bg-background/50 p-3.5";

function StateLabel({ state }: { state: string }) {
  return (
    <span className={cn("font-mono text-[10.5px]", state === "Confirmed" ? "text-success" : "text-accent")}>{state}</span>
  );
}

/* ------------------------------------------------------------ 1. dashboard */

export function DashboardScreen() {
  const stats = [
    { label: "Findings", value: String(FINDING_TOTAL), sub: `${CONFIRMED} confirmed · ${FINDING_TOTAL - CONFIRMED} need review` },
    { label: "Tool execution", value: ASSESSMENT.requests, sub: "requests sent by the tools" },
    { label: "Duration", value: ASSESSMENT.duration, sub: ASSESSMENT.date },
  ];
  return (
    <ViewerWindow path="/" active="overview">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold leading-tight sm:text-xl">Assessment Operations Center</p>
          <p className="mt-1 text-sm text-muted-foreground">AI-planned security assessments inside an approved scope.</p>
        </div>
        <span className="rounded-md border border-border px-2.5 py-1 font-mono text-[11px] text-primary">
          {ASSESSMENT.id} · {ASSESSMENT.target}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3.5">
          <FieldLabel>Assessment progress</FieldLabel>
          <p className="mt-1 font-display text-2xl font-semibold text-primary">100%</p>
          <ProgressBar value={100} className="mt-2" />
        </div>
        {stats.map((s) => (
          <div key={s.label} className={card}>
            <FieldLabel>{s.label}</FieldLabel>
            <p className="mt-1 font-display text-2xl font-semibold">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-2.5 grid gap-2.5 lg:grid-cols-[1.1fr_1fr]">
        <div className={card}>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <FieldLabel>Execution timeline</FieldLabel>
            <span className="font-mono text-[11px] text-success">{ASSESSMENT.status}</span>
          </div>
          <ol className="divide-y divide-border/70">
            {PLAN.map((p) => (
              <li key={p.step} className="flex gap-2.5 py-2 text-[13px]">
                <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden strokeWidth={2.5} />
                <span className="min-w-0">
                  {p.step}
                  {p.tools && <span className="block font-mono text-[10.5px] text-muted-foreground">{p.tools}</span>}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className={cn(card, "min-w-0")}>
          <FieldLabel className="mb-3">Findings by severity</FieldLabel>
          <SeverityBar data={SEVERITY} />
          <FieldLabel className="mb-1 mt-4">Top findings · CVSS</FieldLabel>
          <ul className="divide-y divide-border/70">
            {FINDINGS.slice(0, 4).map((f) => (
              <li key={f.id} className="flex items-center gap-2.5 py-2">
                <span className="min-w-0 flex-1 truncate text-[13px]">{f.title}</span>
                <SeverityBadge level={f.severity} />
                <span className="w-7 text-right font-mono text-xs">{f.cvss}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ViewerWindow>
  );
}

/* ---------------------------------------------------------------- 2. scope */

const OPTIONS: { n: number; label: string; tag?: string; desc?: string; tone?: "go" | "stop" }[] = [
  { n: 1, label: "Approve scope", tag: "Recommended", desc: "Lock the manifest; next you review the test plan.", tone: "go" },
  { n: 2, label: "Edit manifest", desc: "Change methods, excluded paths, ports, tools or the time limit." },
  { n: 3, label: "Reject", desc: "Discard this draft: nothing is tested and the assessment stops.", tone: "stop" },
  { n: 4, label: "Type something." },
  { n: 5, label: "Chat about this" },
];

export function ScopeScreen() {
  return (
    <TerminalWindow
      title="scope manifest"
      status={
        <>
          <span>Enter to select</span>
          <span>↑/↓ to navigate</span>
          <span>Esc to go back</span>
        </>
      }
    >
      <div className="space-y-4 sm:space-y-5">
        <p className="flex gap-2.5">
          <span className="text-primary">◆</span>
          <span className="min-w-0">
            <span className="text-foreground">reconix</span>{" "}
            <span className="text-muted-foreground">
              Web URL template auto-selected · drafted a scope manifest for your approval
            </span>
          </span>
        </p>

        <div className="rounded-lg border border-primary/40 bg-primary/[0.04] p-3.5 sm:p-4">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
            <ShieldCheck className="size-3.5" aria-hidden strokeWidth={2} /> Scope
          </p>
          <p className="mt-3 text-foreground">
            Reconix will test <span className="break-words text-primary">https://{ASSESSMENT.target}</span> as a{" "}
            <span className="text-primary">web application</span>.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="font-semibold text-foreground">What it may do</p>
              <ul className="mt-1.5 space-y-1">
                {SCOPE.permitted.map((p) => (
                  <li key={p} className="flex gap-2 text-foreground/90">
                    <Check className="mt-[0.3em] size-3.5 shrink-0 text-success" aria-hidden strokeWidth={2.5} />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-foreground">What it will never touch</p>
              <ul className="mt-1.5 space-y-1">
                {SCOPE.excluded.map((p) => (
                  <li key={p} className="flex gap-2 text-danger/90">
                    <X className="mt-[0.3em] size-3.5 shrink-0" aria-hidden strokeWidth={2.5} />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-border/60 pt-3">
            <p className="text-muted-foreground">
              Tools it will use: <span className="text-foreground">{SCOPE.tools}</span>
            </p>
            <p className="text-accent">draft · needs your approval</p>
          </div>
        </div>

        <p className="flex gap-2 text-muted-foreground">
          <Info className="mt-[0.3em] size-3.5 shrink-0" aria-hidden strokeWidth={1.75} />
          <span>The agent can only act inside this manifest. Anything else is blocked before a tool runs.</span>
        </p>

        <div>
          <p className="text-foreground">Approve this scope manifest?</p>
          <ul className="mt-2.5 space-y-1.5">
            {OPTIONS.map((o) => (
              <li key={o.n} className="grid grid-cols-[1rem_1fr] gap-x-1.5">
                <ChevronRight
                  className={cn("mt-[0.3em] size-3.5 text-primary", o.n !== 1 && "invisible")}
                  aria-hidden
                  strokeWidth={2.5}
                />
                <div className="min-w-0">
                  <p className={cn("text-foreground/90", o.tone === "go" && "text-primary", o.tone === "stop" && "text-danger")}>
                    {o.n}. {o.label}
                    {o.tag && <span className="text-muted-foreground"> ({o.tag})</span>}
                  </p>
                  {o.desc && <p className="text-muted-foreground">{o.desc}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </TerminalWindow>
  );
}

/* ------------------------------------------------------------ 3. execution */

const WHO: Record<LogLine["who"], string> = {
  reconix: "text-primary",
  you: "text-foreground",
  policy: "text-accent",
  tool: "text-success",
};
const TONE: Record<LogTone, string> = {
  default: "text-foreground/85",
  ok: "text-success",
  warn: "text-accent",
  block: "font-semibold text-danger",
};

export function ExecutionScreen() {
  return (
    <TerminalWindow
      title="live output"
      status={
        <>
          <span>Nuclei, Katana</span>
          <span>^C stop</span>
          <span className="ml-auto text-accent">● waiting for you</span>
        </>
      }
    >
      <ol className="space-y-1">
        {LOG.map((l) => (
          <li key={l.t} className="app-log-line grid grid-cols-[4.5rem_1fr] gap-x-3 sm:grid-cols-[4.75rem_4.5rem_1fr]">
            <span className="text-muted-foreground/70">{l.t}</span>
            <span className={cn("hidden font-semibold sm:block", WHO[l.who])}>{l.who}</span>
            <span className={cn("min-w-0", TONE[l.tone ?? "default"])}>{l.text}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 rounded-lg border border-accent/50 bg-accent/5 p-3.5">
        <p className="text-accent">Approval required · risk MEDIUM</p>
        <p className="mt-1 text-foreground">Baseline request (read-only)</p>
        <p className="mt-1 break-words text-foreground/90">
          GET https://{ASSESSMENT.target}/api/v1/products?q=cotton+socks (no authentication)
        </p>
        <p className="mt-1 text-muted-foreground">Record a normal search response to compare against the injection probes</p>
      </div>
    </TerminalWindow>
  );
}

/* ------------------------------------------------------------- 4. findings */

export function FindingsScreen() {
  return (
    <ViewerWindow path="/findings" active="findings">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="mr-auto font-display text-lg font-semibold">
          Findings <span className="font-mono text-sm font-normal text-muted-foreground">{FINDING_TOTAL}</span>
        </p>
        <span className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
          <Search className="size-3.5" aria-hidden /> Search title, ID, CWE, target…
        </span>
        <span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">Confirmed {CONFIRMED}</span>
        <span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
          Needs review {FINDING_TOTAL - CONFIRMED}
        </span>
      </div>
      <div className="grid gap-3 xl:grid-cols-[1fr_1.15fr]">
        <ul className="min-w-0 self-start overflow-hidden rounded-lg border border-border bg-background/50">
          {FINDINGS.map((f) => (
            <li
              key={f.id}
              className={cn(
                "grid grid-cols-[5.25rem_1fr] items-start gap-3 border-b border-border px-3 py-2.5 last:border-b-0",
                f.id === FEATURED.id && "bg-primary/10 shadow-[inset_2px_0_0_var(--primary)]"
              )}
            >
              <SeverityBadge level={f.severity} />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">{f.title}</p>
                <p className="truncate font-mono text-[10.5px] text-muted-foreground">
                  {f.id} · {f.path}
                </p>
                <StateLabel state={f.state} />
              </div>
            </li>
          ))}
        </ul>

        <article className="min-w-0 rounded-lg border border-primary/30 bg-background/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge level={FEATURED.severity} />
            <span className="font-mono text-[11px] text-muted-foreground">
              {FEATURED.id} · CVSS {FEATURED.cvss} · {FEATURED.tool}
            </span>
            <StateLabel state={FEATURED.state} />
          </div>
          <p className="mt-2 font-display text-base font-semibold leading-snug">{FEATURED.title}</p>
          <p className="break-words font-mono text-[11px] text-primary">{FEATURED.target}</p>

          <dl className="mt-3 space-y-3 text-[13px] leading-relaxed">
            <div>
              <dt><FieldLabel>Description</FieldLabel></dt>
              <dd className="mt-0.5 text-foreground/85">{FEATURED.description}</dd>
            </div>
            <div>
              <dt><FieldLabel>Impact</FieldLabel></dt>
              <dd className="mt-0.5 text-foreground/85">{FEATURED.impact}</dd>
            </div>
            <div>
              <dt><FieldLabel>Evidence · sensitive values masked</FieldLabel></dt>
              <dd className="app-terminal mt-1 overflow-x-auto rounded-md border border-border p-2.5 font-mono text-[11px] leading-relaxed">
                {FEATURED.evidence.map((e) => (
                  <span key={e} className="block whitespace-pre">{e}</span>
                ))}
              </dd>
            </div>
            <div>
              <dt><FieldLabel>Remediation</FieldLabel></dt>
              <dd>
                <ul className="mt-1 space-y-1 text-foreground/85">
                  {FEATURED.remediation.map((r) => (
                    <li key={r} className="flex gap-2">
                      <Check className="mt-1 size-3.5 shrink-0 text-success" aria-hidden strokeWidth={2.5} /> {r}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
          <p className="mt-3 flex flex-wrap gap-1.5 font-mono text-[10px]">
            {FEATURED.references.map((r) => (
              <span key={r} className="rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-primary">{r}</span>
            ))}
          </p>
        </article>
      </div>
    </ViewerWindow>
  );
}

/* --------------------------------------------------------------- 5. report */

export function ReportScreen() {
  const toc = ["Executive summary", "Findings summary", "Approved scope", "Detailed findings", "Policy & governance"];
  return (
    <ViewerWindow path="/reports" active="reports">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="mr-auto font-display text-lg font-semibold">Report</p>
        {["PDF", "DOCX", "JSON"].map((format, i) => (
          <span
            key={format}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold",
              i === 0 ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
            )}
          >
            <Download className="size-3.5" aria-hidden /> {format}
          </span>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[10rem_1fr]">
        <ol className="hidden space-y-0.5 text-[13px] lg:block">
          {toc.map((s, i) => (
            <li
              key={s}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-muted-foreground",
                i === 0 && "bg-primary/10 text-foreground shadow-[inset_2px_0_0_var(--primary)]"
              )}
            >
              {i + 1}. {s}
            </li>
          ))}
        </ol>

        {/* the sheet: slightly lighter than the window so it reads as a document */}
        <article className="app-paper rounded-lg border border-border p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
            <div>
              <FieldLabel>Security assessment report</FieldLabel>
              <p className="mt-1 font-display text-xl font-semibold leading-tight">{ASSESSMENT.name}</p>
            </div>
            <span className="rounded-md border border-danger/50 bg-danger/10 px-2.5 py-1 text-center">
              <span className="block font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">overall risk</span>
              <span className="font-display text-sm font-semibold text-danger">Critical</span>
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-3 border-b border-border py-3 text-xs sm:grid-cols-4">
            {[
              ["Target", ASSESSMENT.target],
              ["Template", ASSESSMENT.template],
              ["Date", ASSESSMENT.date],
              ["Scope approved by", ASSESSMENT.approvedBy],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="truncate font-mono text-foreground">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="grid gap-5 pt-4 md:grid-cols-[1.1fr_1fr]">
            <div>
              <p className="font-display text-sm font-semibold">Executive summary</p>
              <p className="mt-1 text-[13px] leading-relaxed text-foreground/80">
                {FINDING_TOTAL} findings: {CONFIRMED} confirmed, {FINDING_TOTAL - CONFIRMED} marked for review. A SQL
                injection in the catalog search exposes the customer database and needs no login to exploit.
              </p>
              <p className="mt-4 font-display text-sm font-semibold">Findings by severity</p>
              <div className="mt-2">
                <SeverityBar data={SEVERITY} />
              </div>
            </div>
            <div className="rounded-md border border-border bg-background/40 p-3">
              <div className="flex items-center gap-2">
                <SeverityBadge level={FEATURED.severity} />
                <span className="font-mono text-[10.5px] text-muted-foreground">{FEATURED.id} · {FEATURED.cwe}</span>
              </div>
              <p className="mt-1.5 text-[13px] font-semibold">{FEATURED.title}</p>
              <FieldLabel className="mt-3">Remediation</FieldLabel>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[12.5px] text-foreground/80">
                {FEATURED.remediation.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ol>
            </div>
          </div>
        </article>
      </div>
    </ViewerWindow>
  );
}
