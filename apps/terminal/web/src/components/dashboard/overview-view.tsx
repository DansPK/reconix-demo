import { SITE_TAGLINE } from "@/lib/site";
import { Globe } from "@/components/dashboard/globe";
import { ActivityTimeline } from "@/components/dashboard/activity-timeline";
import { AskBar } from "@/components/dashboard/ask-bar";
import { ExecutionTimeline } from "@/components/dashboard/execution-timeline";
import { FindingsCard } from "@/components/dashboard/findings-card";
import type { OverviewCards } from "@/components/dashboard/overview-types";
import { SummaryStrip } from "@/components/dashboard/summary-strip";

/** Overview: the summary strip, the hero (globe, title, Ask bar), Findings by Severity and the two
    timelines, for one run or for every saved run (the parts draw whichever `cards` they get).
    `data-motion` names the groups the assistant's transition moves (top, hero, fade, right,
    bottom); it never finds them by class name. Server component. */
export function OverviewView({ cards }: { cards: OverviewCards }) {
  return (
    <div className="dash-overview" data-mode={cards.mode}>
      <SummaryStrip data={cards.summary} />

      <section aria-label="Assessment overview" className="dash-hero" data-motion="hero">
        <Globe />
        <div className="dash-hero-title" data-motion="fade">
          <h1 className="dash-reveal text-[26px] font-medium leading-[1.15] tracking-[-0.01em] text-foreground">
            Assessment Operations Center
          </h1>
          <p className="dash-reveal mt-1 text-[13px] text-muted-foreground">{SITE_TAGLINE}</p>
        </div>
        <AskBar data={cards.ask} />
      </section>

      <div className="dash-right" data-motion="right">
        <FindingsCard data={cards.findings} />
      </div>

      <div className="dash-bottom" data-motion="bottom">
        <ActivityTimeline data={cards.activity} />
        <ExecutionTimeline data={cards.execution} />
      </div>
    </div>
  );
}
