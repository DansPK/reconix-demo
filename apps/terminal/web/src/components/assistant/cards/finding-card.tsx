/* One finding in full from the saved data: severity, CVSS, target, run, review state, tool and
   CWE, then its description, impact and remediation. */
import { ShieldAlert } from "lucide-react";
import { FINDING_REVIEW } from "@/lib/status";
import { SeverityBadge, StatusBadge } from "@/components/ui/status-badge";
import type { CardOf } from "@/lib/assistant/protocol";
import { CardShell, runName } from "./card-shell";
import { FindingLink } from "./links";

export function FindingCard({ card }: { card: CardOf<"finding"> }) {
  const f = card.item;
  return (
    <CardShell icon={ShieldAlert} title={`Finding ${f.id}`} meta={runName(f.run)} footer={<FindingLink uid={f.run.uid} id={f.id} />}>
      <div className="ai-card-section">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge level={f.severity} />
          <span className="ai-cvss">{f.cvss === null ? "no CVSS" : `CVSS ${f.cvss.toFixed(1)}`}</span>
          <StatusBadge meaning={FINDING_REVIEW[f.review]} />
        </div>
        <p className="mt-2 text-[14px] font-medium leading-snug text-foreground [overflow-wrap:anywhere]">{f.title}</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
          <dt className="text-muted-foreground">Target</dt>
          <dd className="ai-mono min-w-0 text-foreground [overflow-wrap:anywhere]">{f.target}</dd>
          <dt className="text-muted-foreground">Tool</dt>
          <dd className="text-foreground">{card.tool}</dd>
          <dt className="text-muted-foreground">Weakness</dt>
          <dd className="ai-mono text-foreground">{card.cwe}</dd>
        </dl>
      </div>
      {card.description && (
        <div className="ai-card-section">
          <p className="ai-card-label">Description</p>
          <p className="ai-card-text">{card.description}</p>
        </div>
      )}
      {card.impact && (
        <div className="ai-card-section">
          <p className="ai-card-label">Impact</p>
          <p className="ai-card-text">{card.impact}</p>
        </div>
      )}
      {card.remediation.length > 0 && (
        <div className="ai-card-section">
          <p className="ai-card-label">Remediation</p>
          <ul className="ai-card-text ai-card-list">
            {card.remediation.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </CardShell>
  );
}
