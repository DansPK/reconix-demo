/* Approvals from the saved data: each gated action with its recorded decision (Approved,
   Rejected, Waiting for approval or Not reached, as lib/status.ts names them) and its risk, the
   server's count of every decision by state, and runs paused on another input (a sign-in). Nothing can be approved here:
   decisions are made in the TUI, with its double check. */
import { Hand } from "lucide-react";
import { APPROVAL_STATE, riskMeaning, RUN_STATUS } from "@/lib/status";
import { StatusBadge } from "@/components/ui/status-badge";
import { STATE_ORDER } from "@/lib/assistant/cards";
import type { CardOf } from "@/lib/assistant/protocol";
import { CardShell, runName } from "./card-shell";

export function ApprovalsCard({ card }: { card: CardOf<"approvals"> }) {
  const waiting = card.pending + card.waiting.length;
  const runs = new Set([...card.items, ...card.waiting].map((x) => x.run.uid)).size;
  // the server's count over every approval (older saved cards have none)
  const counts = card.counts ? STATE_ORDER.map((state) => ({ state, count: card.counts![state] })).filter((c) => c.count > 0) : [];
  return (
    <CardShell
      icon={Hand}
      title="Approvals"
      meta={
        <>
          {waiting ? `${waiting} waiting for you` : "Nothing waits on you"}
          {counts.length > 0 && (
            <span className="ai-card-meta">
              <span className="sr-only">Decisions recorded: </span>
              {" · "}
              {counts.map((c) => `${c.count} ${APPROVAL_STATE[c.state].label.toLowerCase()}`).join(" · ")}
            </span>
          )}
        </>
      }
      footer={<span>Decide in the TUI. Nothing can be approved from this chat.</span>}
    >
      {card.items.length === 0 && card.waiting.length === 0 ? (
        <p className="ai-card-empty">No gated actions in the saved data.</p>
      ) : (
        <ul aria-label="Gated actions">
          {card.waiting.map((w) => (
            <li key={`wait-${w.run.uid}`} className="ai-card-row">
              <StatusBadge meaning={RUN_STATUS["Awaiting input"]} />
              <div className="ai-card-row-main">
                <p className="ai-card-line">{w.text}</p>
                <p className="ai-card-sub">{runName(w.run)}</p>
              </div>
            </li>
          ))}
          {card.items.map((a) => (
            <li key={`${a.run.uid}-${a.id}`} className="ai-card-row">
              <StatusBadge meaning={APPROVAL_STATE[a.state]} />
              <div className="ai-card-row-main">
                <p className="ai-card-line">
                  <span className="ai-mono">{a.action}</span>{" "}
                  <span className="text-muted-foreground" title={riskMeaning(a.risk).hint}>
                    · {riskMeaning(a.risk).label.toLowerCase()}
                  </span>
                </p>
                <p className="ai-card-sub">
                  <span className="ai-mono">{a.target}</span>
                  {runs > 1 ? ` · ${runName(a.run)}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {card.more > 0 && <p className="ai-card-empty">{card.more} more not shown.</p>}
    </CardShell>
  );
}
