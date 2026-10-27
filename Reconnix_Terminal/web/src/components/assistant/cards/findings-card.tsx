/* Findings from the saved data: the severity mix (bar and counts, each with its name) and the
   worst findings with CVSS, target, run and review state, each opening in Findings. */
import { Bug } from "lucide-react";
import { FINDING_REVIEW, SEVERITY_META } from "@/lib/status";
import { SeverityBadge, StatusBadge } from "@/components/ui/status-badge";
import type { CardOf } from "@/lib/assistant/protocol";
import { SEVERITY_ORDER } from "@/lib/assistant/insights";
import { CardShell, runName } from "./card-shell";
import { FindingLink } from "./links";

export function FindingsCard({ card }: { card: CardOf<"findings"> }) {
  const present = SEVERITY_ORDER.filter((s) => card.counts[s] > 0);
  const several = card.runs > 1;
  return (
    <CardShell
      icon={Bug}
      title="Findings"
      meta={card.total ? `${card.total} ${several ? `across ${card.runs} runs` : card.total === 1 ? "finding" : "findings"}` : undefined}
      footer={card.total > card.items.length ? <span>Showing the {card.items.length} worst of {card.total}</span> : undefined}
    >
      {card.total === 0 ? (
        <p className="ai-card-empty">No findings in the saved data{several ? " for these runs" : ""}.</p>
      ) : (
        <>
          <div className="ai-card-section">
            <div className="ai-sevbar" role="img" aria-label={present.map((s) => `${card.counts[s]} ${SEVERITY_META[s].label}`).join(", ")}>
              {present.map((s) => (
                <span key={s} style={{ width: `${(card.counts[s] / card.total) * 100}%`, background: SEVERITY_META[s].color }} />
              ))}
            </div>
            <div className="ai-sev-legend">
              {present.map((s) => (
                <span key={s}>
                  <SeverityBadge level={s} />
                  <span className="ai-num text-foreground">{card.counts[s]}</span>
                </span>
              ))}
            </div>
          </div>
          <ul aria-label="Worst findings">
            {card.items.map((f) => (
              <li key={`${f.run.uid}~${f.id}`} className="ai-card-row">
                <span className="ai-sev-col">
                  <SeverityBadge level={f.severity} />
                  <span className="ai-cvss" title="CVSS base score">
                    {f.cvss === null ? "no CVSS" : `CVSS ${f.cvss.toFixed(1)}`}
                  </span>
                </span>
                <div className="ai-card-row-main">
                  <p className="ai-card-line">
                    <span className="ai-mono text-muted-foreground">{f.id}</span> {f.title}
                  </p>
                  <p className="ai-card-sub">
                    <span className="ai-mono">{f.target}</span>
                    {several ? ` · ${runName(f.run)}` : ""}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <StatusBadge meaning={FINDING_REVIEW[f.review]} />
                    <FindingLink uid={f.run.uid} id={f.id} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </CardShell>
  );
}
