/* The pieces of a summary-strip card, shared by the Overview's SummaryStrip and the Report
   view's StatStrip: the labelled card, its big number (data-countup for the intro's count-up)
   and its meter. A meter reads as progress (teal) until it is past its limit (red):
   the tones of lib/status.ts, chosen here and nowhere else. */
import type { LucideIcon } from "lucide-react";

import { type Tone, toneColor } from "@/lib/status";

const meterTone = (over: boolean): Tone => (over ? "danger" : "primary");

export function StatCard({ label, icon: Icon, children }: { label: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section aria-label={label} className="dash-card dash-stat">
      <h2 className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" strokeWidth={1.8} aria-hidden />
        {label}
      </h2>
      {children}
    </section>
  );
}

export const StatValue = ({ value, format = "int" }: { value: string; format?: "int" | "pct" | "duration" | "none" }) =>
  format === "none" ? (
    <span className="dash-stat-value tabnums">{value}</span>
  ) : (
    <span key={value} className="dash-stat-value tabnums" data-countup data-count-format={format}>
      {value}
    </span>
  );

export function StatMeter({ frac, over = false, label }: { frac: number; over?: boolean; label: string }) {
  return (
    <span className="dash-meter" role="meter" aria-label={label} aria-valuenow={Math.round(frac * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span data-bar-x style={{ width: `${frac * 100}%`, background: toneColor(meterTone(over)) }} />
    </span>
  );
}
