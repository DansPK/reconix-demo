/* The frame every reply card shares: an icon, a title and a short meta line, the "Saved data"
   mark (the card is built by the dashboard from the saved files, never by the model), the body
   and an optional footer. */
import { ShieldCheck, type LucideIcon } from "lucide-react";

export function CardShell({
  icon: Icon,
  title,
  meta,
  tone,
  footer,
  children,
}: {
  icon: LucideIcon;
  title: string;
  meta?: React.ReactNode;
  tone?: "info" | "warning" | "danger";
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="ai-card" data-tone={tone} aria-label={title}>
      <header className="ai-card-head">
        <Icon className="ai-card-icon" aria-hidden />
        <h3 className="ai-card-title">{title}</h3>
        {meta ? <span className="ai-card-meta">{meta}</span> : null}
        {!tone && (
          <span className="ai-card-source" title="Built by the dashboard from the saved assessment files, not written by the AI model">
            <ShieldCheck className="size-3" aria-hidden /> Saved data
          </span>
        )}
      </header>
      <div className="ai-card-body">{children}</div>
      {footer ? <footer className="ai-card-foot">{footer}</footer> : null}
    </section>
  );
}

/** "RCX-DEMO-002 · 5 Oct 14:03" */
export const runName = (run: { label: string; when: string }) => `${run.label} · ${run.when}`;

export function Bar({ pct, tone, label }: { pct: number; tone?: "success"; label: string }) {
  return (
    <div className="ai-bar" data-tone={tone} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}
