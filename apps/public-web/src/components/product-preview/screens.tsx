import { Check, Download, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ASSESSMENT,
  FEATURED,
  FINDINGS,
  FINDING_TOTAL,
  LOG,
  RECENT,
  SCOPE,
  SEVERITY,
  type LogKind,
} from "@/components/product-preview/data";
import {
  FieldLabel,
  ProgressBar,
  RiskBadge,
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

function RunningPill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-primary">
      <span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
      {ASSESSMENT.status}
    </span>
  );
}

const KIND: Record<LogKind, { tag: string; tagClass: string; textClass: string }> = {
  info: { tag: "info", tagClass: "text-muted-foreground", textClass: "text-foreground/85" },
  scope: { tag: "scope", tagClass: "text-primary", textClass: "text-foreground" },
  policy: { tag: "policy", tagClass: "text-primary", textClass: "text-foreground" },
  tool: { tag: "tool", tagClass: "text-foreground/70", textClass: "text-foreground/85" },
  mask: { tag: "mask", tagClass: "text-muted-foreground", textClass: "text-muted-foreground" },
  finding: { tag: "finding", tagClass: "text-danger", textClass: "text-foreground" },
  gate: { tag: "gate", tagClass: "text-accent", textClass: "text-accent" },
};

/* ------------------------------------------------------------ 1. dashboard */

export function DashboardScreen() {
  const stats = [
    { label: "Started", value: ASSESSMENT.started, sub: ASSESSMENT.date },
    { label: "Duration", value: ASSESSMENT.duration, sub: "of 2 h window" },
    { label: "Findings", value: String(FINDING_TOTAL), sub: "1 critical" },
  ];
  return (
    <ViewerWindow path={`/assessments/${ASSESSMENT.id}`} active="assessments">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <FieldLabel>{ASSESSMENT.id} · {ASSESSMENT.template} template</FieldLabel>
          <p className="mt-1 font-display text-lg font-semibold leading-tight sm:text-xl">{ASSESSMENT.name}</p>
          <p className="mt-1 font-mono text-xs text-primary">{ASSESSMENT.target}</p>
        </div>
        <RunningPill />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3.5">
          <FieldLabel>Progress</FieldLabel>
          <p className="mt-1 font-display text-2xl font-semibold text-primary">{ASSESSMENT.progress}%</p>
          <ProgressBar value={ASSESSMENT.progress} className="mt-2" />
        </div>
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-background/50 p-3.5">
            <FieldLabel>{s.label}</FieldLabel>
            <p className="mt-1 font-display text-2xl font-semibold">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-2.5 grid gap-2.5 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-lg border border-border bg-background/50 p-3.5">
          <FieldLabel className="mb-3">Severity summary</FieldLabel>
          <ul className="mb-4 grid grid-cols-4 gap-2 text-center">
            {SEVERITY.map((s) => (
              <li key={s.level}>
                <p className="font-display text-2xl font-semibold">{s.count}</p>
                <SeverityBadge level={s.level} className="mt-1 w-full px-1 text-[9px] tracking-[0.06em]" />
              </li>
            ))}
          </ul>
          <SeverityBar data={SEVERITY} />
        </div>
        <div className="rounded-lg border border-border bg-background/50 p-3.5">
          <FieldLabel className="mb-2">Recent activity</FieldLabel>
          <ol className="divide-y divide-border/70 font-mono text-[11.5px]">
            {RECENT.map((l) => (
              <li key={l.t} className="grid grid-cols-[4.25rem_1fr] gap-2 py-2">
                <span className="text-muted-foreground">{l.t}</span>
                <span className={cn("min-w-0", KIND[l.kind].textClass)}>{l.text}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </ViewerWindow>
  );
}

/* ---------------------------------------------------------------- 2. scope */

export function ScopeScreen() {
  return (
    <TerminalWindow
      title="scope manifest"
      status={
        <>
          <span>{SCOPE.include.length} in scope</span>
          <span>{SCOPE.exclude.length} excluded</span>
          <span>{SCOPE.actions.length} actions</span>
          <span className="ml-auto text-accent">● draft · nothing runs until approved</span>
        </>
      }
    >
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Target</FieldLabel>
              <p className="mt-1 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-foreground">{SCOPE.target}</p>
            </div>
            <div>
              <FieldLabel>Assessment type</FieldLabel>
              <p className="mt-1 rounded-md border border-border px-2.5 py-1.5 text-foreground">{ASSESSMENT.type}</p>
            </div>
          </div>
          <div>
            <FieldLabel>In scope</FieldLabel>
            <ul className="mt-1.5 space-y-1">
              {SCOPE.include.map((h) => (
                <li key={h} className="flex items-center gap-2 text-foreground">
                  <Check className="size-3.5 text-success" aria-hidden strokeWidth={2.5} /> {h}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <FieldLabel>Excluded</FieldLabel>
            <ul className="mt-1.5 space-y-1">
              {SCOPE.exclude.map((h) => (
                <li key={h} className="flex items-center gap-2 text-danger/90">
                  <X className="size-3.5" aria-hidden strokeWidth={2.5} /> {h}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <FieldLabel>Permitted actions</FieldLabel>
            <ul className="mt-1.5 divide-y divide-border/70 rounded-md border border-border">
              {SCOPE.actions.map((a) => (
                <li key={a.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-2.5 py-1.5">
                  <span className="truncate text-foreground">{a.name}</span>
                  <span className="text-muted-foreground">{a.tool}</span>
                  <RiskBadge level={a.risk} />
                </li>
              ))}
            </ul>
          </div>
          <div>
            <FieldLabel>Limits</FieldLabel>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {SCOPE.limits.map((l) => (
                <div key={l.label} className="rounded-md border border-border px-2.5 py-1.5">
                  <p className="text-foreground">{l.value}</p>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{l.label}</p>
                </div>
              ))}
            </div>
          </div>
          <p className="pt-1">
            <span className="text-primary">?</span> Approve Scope Manifest v1?{" "}
            <span className="rounded bg-primary/15 px-1.5 text-primary">[y/N]</span>{" "}
            <span aria-hidden className="cursor text-primary">▌</span>
          </p>
        </div>
      </div>
    </TerminalWindow>
  );
}

/* ------------------------------------------------------------ 3. execution */

export function ExecutionScreen() {
  return (
    <TerminalWindow
      title={`run ${ASSESSMENT.id}`}
      status={
        <>
          <span><span className="text-foreground">11</span>/40 tool calls</span>
          <span><span className="text-foreground">4</span>/12 iterations</span>
          <span><span className="text-foreground">18</span>/120 min</span>
          <span className="ml-auto text-primary">● running</span>
        </>
      }
    >
      <div className="mb-4 flex items-center gap-3">
        <span className="shrink-0 text-muted-foreground">progress</span>
        <ProgressBar value={ASSESSMENT.progress} />
        <span className="shrink-0 text-foreground">{ASSESSMENT.progress}%</span>
      </div>
      <ol className="space-y-1">
        {LOG.map((l) => (
          <li key={l.t} className="app-log-line grid grid-cols-[4.5rem_1fr] gap-x-3 sm:grid-cols-[4.75rem_4.5rem_1fr]">
            <span className="text-muted-foreground/70">[{l.t}]</span>
            <span className={cn("hidden sm:block", KIND[l.kind].tagClass)}>{KIND[l.kind].tag}</span>
            <span className={cn("min-w-0", KIND[l.kind].textClass)}>{l.text}</span>
          </li>
        ))}
        <li className="grid grid-cols-[4.5rem_1fr] gap-x-3 text-muted-foreground sm:grid-cols-[4.75rem_4.5rem_1fr]">
          <span />
          <span className="hidden sm:block" />
          <span>
            Assessment still running <span aria-hidden className="cursor">▌</span>
          </span>
        </li>
      </ol>
      <div className="mt-4 rounded-lg border border-accent/50 bg-accent/5 p-3.5">
        <p className="text-accent">⚠ Approval required · risk MEDIUM</p>
        <p className="mt-1 text-foreground/90">OWASP ZAP active scan → https://app.acme.example</p>
        <p className="mt-2.5 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded border border-accent/60 bg-accent/15 px-2 py-0.5 text-accent">[a] approve</span>
          <span className="rounded border border-border px-2 py-0.5 text-muted-foreground">[s] skip</span>
          <span className="rounded border border-border px-2 py-0.5 text-muted-foreground">[x] stop run</span>
        </p>
      </div>
    </TerminalWindow>
  );
}

/* ------------------------------------------------------------- 4. findings */

export function FindingsScreen() {
  return (
    <ViewerWindow path={`/assessments/${ASSESSMENT.id}/findings`} active="findings">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="mr-auto font-display text-lg font-semibold">
          Findings <span className="font-mono text-sm font-normal text-muted-foreground">{FINDING_TOTAL}</span>
        </p>
        <span className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
          <Filter className="size-3.5" aria-hidden /> severity: all
        </span>
        <span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">sort: severity</span>
      </div>
      <div className="grid gap-3 xl:grid-cols-[1fr_1.15fr]">
        <ul className="self-start overflow-hidden rounded-lg border border-border bg-background/50">
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
                  {f.target} · {f.tool}
                </p>
              </div>
            </li>
          ))}
          <li className="px-3 py-2 text-center font-mono text-[11px] text-muted-foreground">
            + {FINDING_TOTAL - FINDINGS.length} more
          </li>
        </ul>

        <article className="rounded-lg border border-primary/30 bg-background/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge level={FEATURED.severity} />
            <span className="font-mono text-[11px] text-muted-foreground">
              {FEATURED.id} · {FEATURED.rating} · conf {FEATURED.confidence.toFixed(2)}
            </span>
          </div>
          <p className="mt-2 font-display text-base font-semibold leading-snug">{FEATURED.title}</p>
          <p className="font-mono text-[11px] text-primary">{FEATURED.target}</p>

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
              <dt><FieldLabel>Evidence · secrets masked</FieldLabel></dt>
              <dd className="app-terminal mt-1 overflow-x-auto rounded-md border border-border p-2.5 font-mono text-[11px] leading-relaxed">
                {FEATURED.evidence.map((e) => (
                  <span
                    key={e.text}
                    className={cn(
                      "block whitespace-pre",
                      e.tone === "request" && "text-foreground",
                      e.tone === "response" && "text-danger/90",
                      e.tone === "masked" && "text-muted-foreground"
                    )}
                  >
                    {e.text}
                  </span>
                ))}
              </dd>
            </div>
            <div>
              <dt><FieldLabel>Recommended remediation</FieldLabel></dt>
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
  const toc = ["Assessment", "Executive summary", "Risk summary", "Findings", "Remediation", "Limitations"];
  return (
    <ViewerWindow path={`/reports/${ASSESSMENT.id}`} active="reports">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="mr-auto font-display text-lg font-semibold">Report</p>
        <span className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
          <Download className="size-3.5" aria-hidden /> Export PDF
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[10rem_1fr]">
        <ol className="hidden space-y-0.5 text-[13px] lg:block">
          {toc.map((s, i) => (
            <li
              key={s}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-muted-foreground",
                i === 2 && "bg-primary/10 text-foreground shadow-[inset_2px_0_0_var(--primary)]"
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
              ["Type", ASSESSMENT.type],
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
                {FINDING_TOTAL} findings across 4 in-scope hosts. A SQL injection on the public search page
                exposes customer data and should be fixed before the next release.
              </p>
              <p className="mt-4 font-display text-sm font-semibold">Severity distribution</p>
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
              <FieldLabel className="mt-3">Recommended remediation</FieldLabel>
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
