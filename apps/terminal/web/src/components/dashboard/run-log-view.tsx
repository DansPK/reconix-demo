/* The Run log view: one run's whole timeline read like a Claude conversation (derive-run-log.ts).
   What you typed and what Reconix said stay on the page; the work between two messages folds into
   a thinking block (ThinkingBlock) that opens to its steps. With every run shown there is no one
   conversation to read, so it asks for a run. Server component. */
import type { RunLogData, RunLogMessage } from "@/components/dashboard/derive-run-log";
import { ThinkingBlock } from "@/components/dashboard/thinking-block";
import { DocsLink, ViewHeader } from "@/components/dashboard/view-header";
import { EmptyNote } from "@/components/ui/empty-note";
import { DOCS } from "@/lib/docs-nav";

const ABOUT = "What you typed and what Reconix said. The work between two messages folds into one block: open it to see each step.";

// who said a message: a glyph on screen, words for a screen reader
const GLYPH: Record<RunLogMessage["speaker"], string> = { you: "›", reconix: "◆", policy: "■", "": "" };
const SPOKEN: Record<RunLogMessage["speaker"], string> = { you: "You: ", reconix: "Reconix: ", policy: "Policy: ", "": "" };

function Message({ m }: { m: RunLogMessage }) {
  return (
    <li className="dash-runlog-msg" data-speaker={m.speaker || undefined} data-tone={m.tone} data-banner={m.banner ? "" : undefined}>
      <span className="dash-runlog-glyph" aria-hidden>
        {GLYPH[m.speaker]}
      </span>
      <span className="min-w-0 [overflow-wrap:anywhere]">
        <span className="sr-only">{SPOKEN[m.speaker]}</span>
        {m.text}
      </span>
    </li>
  );
}

export function RunLogView({ data }: { data: RunLogData | null }) {
  return (
    <div className="dash-view dash-sheet">
      <ViewHeader title="Run log" tag={data?.tag} about={ABOUT} docsHref={DOCS.panelRunLog}>
        <DocsLink href={DOCS.assessmentGuide}>Assessment guide</DocsLink>
      </ViewHeader>
      {!data ? (
        <EmptyNote>Open one run (the run switcher in the top bar) to read its log.</EmptyNote>
      ) : data.items.length ? (
        <section aria-label={`Run log · ${data.caption}`} className="dash-card">
          <p className="mb-2 text-xs text-muted-foreground">{data.caption}</p>
          <ol className="dash-runlog">
            {data.items.map((item) =>
              item.type === "message" ? <Message key={item.key} m={item} /> : <ThinkingBlock key={item.key} block={item} />,
            )}
          </ol>
        </section>
      ) : (
        <EmptyNote>Nothing logged yet: the log fills in as the run goes.</EmptyNote>
      )}
    </div>
  );
}
