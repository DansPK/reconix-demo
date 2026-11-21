"use client";

/* The chosen finding: its header (ID, severity, rating, CVSS, title, Previous / Next in the
   filtered order) and, under it, the facts, description, masked evidence (scrolls sideways
   inside), remediation and validation. On the fixed desktop frame the header stays put and only
   the body scrolls, and only when the finding is taller than the frame (styles/findings.css).
   Focusable (a phone's detail pane takes focus when a row opens it); a screen reader hears which
   finding is selected and where it sits, not the whole article. */
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { forwardRef, useState } from "react";

import type { ListedFinding } from "@/components/dashboard/derive";
import { reviewLabel, validationOf } from "@/components/dashboard/filters";
import { IconButton } from "@/components/ui/icon-button";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { SeverityBadge, StatusBadge } from "@/components/ui/status-badge";
import { preferredProofLine } from "@/lib/api/adapt";
import { FINDING_REVIEW } from "@/lib/status";
import { cn } from "@/lib/utils";
import { runFindingHref } from "@/components/dashboard/view-url";

const WRAP = "[overflow-wrap:anywhere]"; // saved text may hold long unbroken tokens (URLs, payloads)

// at the ends the buttons stay focusable (aria-disabled), so focus is never dropped
const NAV_BTN = "size-7 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:hover:text-muted-foreground";

const EV_STYLE: Record<string, string> = {
  request: "text-muted-foreground",
  response: "text-foreground",
  masked: "text-info",
};

export { preferredProofLine };

export interface FindingDetailProps {
  finding: ListedFinding;
  position: { index: number; total: number }; // its place in the filtered order (0-based)
  prev: ListedFinding | null;
  next: ListedFinding | null;
  onSelect: (key: string) => void;
}

/** A link back to the run a finding came from (the list spans several runs). */

export const FindingDetail = forwardRef<HTMLElement, FindingDetailProps>(function FindingDetail({ finding: f, position, prev, next, onSelect }, ref) {
  // Demo: the raw values behind the masked evidence, swapped in on request ("Reveal attacker's view").
  const [unmasked, setUnmasked] = useState(false);
  const revealable = (f.evidenceUnmasked?.length ?? 0) > 0;
  const shown = unmasked && revealable ? (f.evidenceUnmasked ?? []) : f.evidence;
  return (
    <article
      ref={ref}
      tabIndex={-1}
      className="dash-card dash-finding scroll-mt-4 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Finding ${f.id}`}
    >
      {/* the one announcement for a change of selection: which finding, and where it sits */}
      <p role="status" className="sr-only">
        Finding {f.id}, {position.index + 1} of {position.total}
      </p>
      <header className="dash-finding-head">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{f.id}</span>
          <SeverityBadge level={f.severity} />
          <span className="font-mono text-xs text-muted-foreground">{f.rating}</span>
          {f.score != null && <span className="ml-auto text-[26px] leading-none tabnums text-foreground">{f.score.toFixed(1)}</span>}
          <nav aria-label="Finding order" className={cn("flex items-center gap-0.5", f.score == null && "ml-auto")}>
            <IconButton label="Previous finding" className={NAV_BTN} aria-disabled={!prev || undefined} onClick={() => prev && onSelect(prev.key)}>
              <ChevronLeft aria-hidden />
            </IconButton>
            <span className="min-w-[4.5em] text-center font-mono text-[11px] tabnums text-muted-foreground">
              {position.index + 1} of {position.total}
            </span>
            <IconButton label="Next finding" className={NAV_BTN} aria-disabled={!next || undefined} onClick={() => next && onSelect(next.key)}>
              <ChevronRight aria-hidden />
            </IconButton>
          </nav>
        </div>
        <h2 className={cn("text-lg font-medium leading-snug text-foreground", WRAP)}>{f.title}</h2>
        {f.run && (
          <p className="text-xs text-muted-foreground">
            From{" "}
            <Link href={f.run.href ?? runFindingHref(f.run.uid, f.id)} className="ui-link font-mono">
              {f.run.label}
            </Link>
          </p>
        )}
      </header>

      <ScrollRegion label="Finding details" className="dash-finding-body">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
          {[
            ["Target", f.target],
            ["Tool", f.tool],
            ["Weakness", f.cwe],
            ["Category", (f.findingCategory ?? "INSUFFICIENT_EVIDENCE").replaceAll("_", " ")],
            ["Confidence", f.confidenceLevel ?? "UNKNOWN"],
            ["Evidence quality", f.evidenceQuality ?? "UNKNOWN"],
            [
              "Verification",
              (() => {
                const ev = f.effectiveVerification;
                if (ev?.legacy) return "legacy, not verified";
                if (ev?.status) return ev.status;
                const isLegacyConfirmed =
                  f.findingCategory === "CONFIRMED_VULNERABILITY" ||
                  f.verificationStatus === "CONFIRMED" ||
                  f.verificationStatus === "legacy, not verified" ||
                  f.validation?.toUpperCase() === "CONFIRMED";
                if (isLegacyConfirmed) return "legacy, not verified";
                return f.verificationStatus ?? "UNKNOWN";
              })(),
            ],
            ["Exploitability", f.exploitability ?? "UNKNOWN"],
            ["Uncertainty", f.classificationUncertainty || "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="truncate font-mono text-foreground">{v}</dd>
            </div>
          ))}
        </dl>

        {f.validatedCvssVector && (
          <section>
            <h3 className="mb-1 text-[13px] font-medium text-foreground">Validated CVSS vector</h3>
            <p className={cn("font-mono text-[11px] text-muted-foreground", WRAP)}>
              {f.validatedCvssVector}
            </p>
          </section>
        )}

        {(f.description || f.impact) && (
          <section>
            <h3 className="mb-1 text-[13px] font-medium text-foreground">Description</h3>
            {f.description && <p className={cn("text-sm leading-relaxed text-muted-foreground", WRAP)}>{f.description}</p>}
            {f.impact && (
              <p className={cn("mt-2 text-sm leading-relaxed text-muted-foreground", WRAP)}>
                <span className="text-foreground">Impact · </span>
                {f.impact}
              </p>
            )}
          </section>
        )}

        {(f.evidenceSummary || f.evidence.length > 0) && (
          <section>
            <h3 className="mb-1.5 flex flex-wrap items-center gap-2 text-[13px] font-medium text-foreground">
              <span>{unmasked && revealable ? "Evidence — attacker's view (unmasked)" : "Evidence"}</span>
              {revealable && (
                <button
                  type="button"
                  onClick={() => setUnmasked((v) => !v)}
                  aria-pressed={unmasked}
                  className="ui-link text-micro font-medium"
                >
                  {unmasked ? "Hide" : "Reveal attacker's view"}
                </button>
              )}
            </h3>
            {f.evidenceSummary && (
              <p className={cn("mb-2 text-sm leading-relaxed text-muted-foreground", WRAP)}>
                {f.evidenceSummary}
              </p>
            )}
            {shown.length > 0 && (
              <ScrollRegion
                label="Evidence"
                className={cn(
                  "dash-tile overflow-x-auto rounded-lg p-3 font-mono text-[11px] leading-relaxed",
                  unmasked && revealable && "ring-1 ring-[var(--sev-critical)]",
                )}
              >
                {shown.map((e, i) => (
                  <div key={i} className={cn("whitespace-pre", EV_STYLE[e.tone])}>
                    {e.text}
                  </div>
                ))}
              </ScrollRegion>
            )}
          </section>
        )}

        <section>
          <h3 className="mb-1 text-[13px] font-medium text-foreground">Validation</h3>
          {(() => {
            const ev = f.effectiveVerification;
            if (ev) {
              if (ev.legacy) {
                return <p className="text-sm text-muted-foreground">legacy, not verified</p>;
              }
              const tool = (ev.verifier || f.tool || "VALIDATION").toUpperCase();
              if (ev.status === "VERIFIED") {
                const proof = preferredProofLine(ev.proofLines);
                const subject = ev.subject;
                const subjectLabel =
                  subject && typeof subject === "object" && typeof (subject as Record<string, unknown>).label === "string"
                    ? ((subject as Record<string, unknown>).label as string)
                    : typeof subject === "string" && subject
                      ? subject
                      : undefined;
                return (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-teal-400">
                      {proof ? `✓ Verified by ${tool}: ${proof}` : `✓ Verified by ${tool}`}
                    </p>
                    {subjectLabel && (
                      <p className="text-sm font-semibold text-foreground" data-testid="verification-subject-label">
                        {subjectLabel}
                      </p>
                    )}
                  </div>
                );
              }
              if (ev.status === "NOT_REPRODUCED") {
                const subject = ev.subject;
                const subjectLabel =
                  subject && typeof subject === "object" && typeof (subject as Record<string, unknown>).label === "string"
                    ? ((subject as Record<string, unknown>).label as string)
                    : typeof subject === "string" && subject
                      ? subject
                      : undefined;
                return (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Not reproduced by {tool}</p>
                    {subjectLabel && (
                      <p className="text-sm text-muted-foreground">{subjectLabel}</p>
                    )}
                  </div>
                );
              }
              if (ev.status === "INCONCLUSIVE") {
                return (
                  <p className="text-sm text-purple-400">
                    {ev.reason ? `Inconclusive: ${ev.reason}` : "Inconclusive"}
                  </p>
                );
              }
              if (ev.status === "DEFERRED") {
                return (
                  <p className="text-sm text-muted-foreground">
                    {ev.reason ? `Deferred: ${ev.reason}` : "Deferred"}
                  </p>
                );
              }
              if (ev.status === "UNVERIFIED") {
                return <p className="text-sm text-muted-foreground">Unverified — needs analyst review.</p>;
              }
            }
            if (
              f.validation?.toUpperCase() === "CONFIRMED" ||
              f.verificationStatus === "CONFIRMED" ||
              f.verificationStatus === "legacy, not verified" ||
              f.findingCategory === "CONFIRMED_VULNERABILITY"
            ) {
              return <p className="text-sm text-muted-foreground">legacy, not verified</p>;
            }
            return (
              <p className="text-sm text-muted-foreground">
                {f.validation ? `${f.validation} — needs analyst review.` : "Unconfirmed — needs analyst review."}
              </p>
            );
          })()}
        </section>

        {f.aiNotes && (f.aiNotes.explanation || f.aiNotes.impact || f.aiNotes.remediation || f.aiNotes.uncertainty) && (
          <section>
            <h3 className="mb-1 text-[13px] font-medium text-foreground">
              AI assessment (not verified)
            </h3>
            {f.aiNotes.explanation && (
              <p className={cn("text-sm leading-relaxed text-muted-foreground", WRAP)}>
                {f.aiNotes.explanation}
              </p>
            )}
            {f.aiNotes.impact && (
              <p className={cn("mt-2 text-sm leading-relaxed text-muted-foreground", WRAP)}>
                <span className="text-foreground">Impact · </span>
                {f.aiNotes.impact}
              </p>
            )}
            {f.aiNotes.remediation && (
              <p className={cn("mt-2 text-sm leading-relaxed text-muted-foreground", WRAP)}>
                <span className="text-foreground">Remediation · </span>
                {f.aiNotes.remediation}
              </p>
            )}
            {f.aiNotes.uncertainty && (
              <p className={cn("mt-2 text-xs leading-relaxed text-muted-foreground", WRAP)}>
                <span className="text-foreground">Uncertainty · </span>
                {f.aiNotes.uncertainty}
              </p>
            )}
          </section>
        )}

        {f.remediation.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-[13px] font-medium text-foreground">Remediation</h3>
            <ul className={cn("list-disc space-y-1 pl-5 text-sm text-muted-foreground", WRAP)}>
              {f.remediation.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </section>
        )}

        {(f.sourceClaims?.length ?? 0) > 0 && (
          <section>
            <h3 className="mb-1.5 text-[13px] font-medium text-foreground">
              Original scanner claims (unvalidated)
            </h3>
            <ul className={cn("list-disc space-y-1 pl-5 text-sm text-muted-foreground", WRAP)}>
              {f.sourceClaims?.map((claim, i) => <li key={`${claim}-${i}`}>{claim}</li>)}
            </ul>
          </section>
        )}

        {(f.reviewHistory?.length ?? 0) > 0 && (
          <section>
            <h3 className="mb-1.5 text-[13px] font-medium text-foreground">
              Analyst review history
            </h3>
            <ul className={cn("list-disc space-y-1 pl-5 text-sm text-muted-foreground", WRAP)}>
              {f.reviewHistory?.map((review, i) => <li key={`${review}-${i}`}>{review}</li>)}
            </ul>
          </section>
        )}

        {f.triageNote && (
          <section>
            <h3 className="mb-1 text-[13px] font-medium text-foreground">Analyst note</h3>
            <p className={cn("text-sm leading-relaxed text-muted-foreground", WRAP)}>{f.triageNote}</p>
          </section>
        )}

        <footer className="flex flex-wrap items-center gap-3 border-t border-border pt-3 text-xs">
          <span className="text-muted-foreground">
            Evidence validation{" "}
            <span className="text-foreground">
              {(() => {
                const ev = f.effectiveVerification;
                if (ev?.legacy) return "legacy, not verified";
                if (ev?.status) return ev.status;
                const isLegacyConfirmed =
                  f.findingCategory === "CONFIRMED_VULNERABILITY" ||
                  f.verificationStatus === "CONFIRMED" ||
                  f.verificationStatus === "legacy, not verified" ||
                  f.validation?.toUpperCase() === "CONFIRMED";
                if (isLegacyConfirmed) return "legacy, not verified";
                return f.validation || "UNCONFIRMED";
              })()}
            </span>
          </span>
          <StatusBadge meaning={FINDING_REVIEW[validationOf(f)]} label={reviewLabel(f)} />
          {f.references.length > 0 && (
            <span className={cn("min-w-0 basis-full font-mono text-[11px] text-muted-foreground sm:ml-auto sm:basis-auto sm:text-right", WRAP)}>
              {f.references.join(" · ")}
            </span>
          )}
        </footer>
      </ScrollRegion>
    </article>
  );
});
