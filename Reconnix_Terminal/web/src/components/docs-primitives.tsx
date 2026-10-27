import { Children, cloneElement, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { Info, TriangleAlert } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { cn } from "@/lib/utils";

/**
 * The building blocks of a docs page (sections, code, callouts, tables). The content files in
 * src/content/docs import these and nothing else from the docs components, so the search index
 * (which walks the content for DocSection titles) never creates an import cycle through the
 * page frame in docs-layout.tsx.
 */

/** `Getting started` -> `getting-started`: a section title's part of its anchor (sectionId). */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * The anchor of a section of a page: `<page>-<section>` (`model-purpose`). A group's page shows
 * all of its pages, so the 19 commands' "Purpose" need the page's slug to stay apart.
 */
export const sectionId = (page: string, title: string) => `${page}-${slugify(title)}`;

/**
 * A titled section of a docs page: an h3 under its page's h2 (the group page is the h1), with
 * the anchor `sectionId(page, title)` ("On this page" and the search jump to it). `page` is set
 * by `withPage` when the group page renders the part; the content never passes it.
 */
export function DocSection({ title, page, children }: { title: string; page?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 id={page ? sectionId(page, title) : slugify(title)} data-toc className="scroll-mt-6 text-xl font-semibold tracking-tight">
        {title}
      </h3>
      <div className="docs-prose space-y-3 leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

/**
 * A page's body with each of its DocSections told which page it belongs to (their anchors become
 * `<page>-<section>`). Walks fragments and plain elements only: a section never sits inside a
 * component of its own. Server-side, before anything renders.
 */
export function withPage(body: ReactNode, page: string): ReactNode {
  return Children.map(body, (child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return child;
    if (child.type === DocSection) return cloneElement(child as ReactElement<{ page?: string }>, { page });
    const inner = child.props.children;
    if (inner == null || typeof inner !== "object") return child;
    if (child.type !== Fragment && typeof child.type !== "string") return child;
    return cloneElement(child, undefined, withPage(inner, page));
  });
}

/** A code block with a Copy button (the button copies exactly the text shown). A long line
    scrolls sideways inside the block, which is then a tab stop named "Code" (ScrollRegion). */
export function Code({ children, label = "Copy code" }: { children: string; label?: string }) {
  return (
    <div className="docs-code group relative">
      <ScrollRegion
        as="pre"
        label="Code"
        className="overflow-x-auto rounded-lg border border-border bg-card p-4 pr-24 font-mono text-[13px] leading-relaxed text-foreground"
      >
        <code>{children}</code>
      </ScrollRegion>
      <CopyButton text={children} label={label} className="docs-copy absolute right-2 top-2" />
    </div>
  );
}

/** Inline code / file names / env vars. */
export function Mono({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">{children}</span>;
}

/** A key on the keyboard, as the TUI's help shows it. */
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-block rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[0.8em] font-medium text-foreground shadow-[inset_0_-1px_0_var(--border)]">
      {children}
    </kbd>
  );
}

const CALLOUTS = {
  note: { icon: Info, box: "border-primary/30 bg-primary/5", tone: "text-primary" },
  warning: { icon: TriangleAlert, box: "border-warning/40 bg-warning/5", tone: "text-warning" },
} as const;

/** Note (teal: information) or warning (amber: waiting or to review, lib/status.ts tones), for
    approval gates and risks. */
export function Callout({
  variant = "note",
  title,
  children,
}: {
  variant?: keyof typeof CALLOUTS;
  title?: string;
  children: React.ReactNode;
}) {
  const c = CALLOUTS[variant];
  const Icon = c.icon;
  return (
    <div role="note" className={cn("flex gap-3 rounded-xl border p-4 text-sm leading-relaxed", c.box)}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", c.tone)} aria-hidden />
      <div className="space-y-1 text-muted-foreground">
        {title && <p className={cn("font-mono text-[11px] font-semibold uppercase tracking-[0.16em]", c.tone)}>{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

/** The name of another part of the docs, inside a sentence ("see Approval gates"): emphasized
    text, never a link. The docs read in place (docs/WEB_DOCS_INLINE_PLAN.md); the reader finds
    the part in the docs sidebar. */
export function DocRef({ children }: { children: React.ReactNode }) {
  return <em className="docs-ref">{children}</em>;
}

/** Numbered steps. */
export function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="docs-steps space-y-2">{children}</ol>;
}

export type TableRow = { key: React.ReactNode; value: React.ReactNode };

/**
 * A two-column table (key → meaning): keys, commands, formats, error messages. It scrolls
 * sideways inside its own box on a narrow screen instead of widening the page.
 */
export function DocTable({ head, rows, caption }: { head: [string, string]; rows: TableRow[]; caption: string }) {
  return (
    <ScrollRegion label={caption} className="overflow-x-auto rounded-lg border border-border">
      <table className="docs-table w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-card font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <tr>
            <th scope="col" className="p-3">
              {head[0]}
            </th>
            <th scope="col" className="p-3">
              {head[1]}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border align-top">
              <th scope="row" className="max-w-[22rem] whitespace-normal break-words p-3 font-mono text-xs font-medium text-foreground">
                {r.key}
              </th>
              <td className="p-3">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

/** Keys and what they do, as the TUI's `?` help lists them. */
export function KeyTable({ rows, caption }: { rows: TableRow[]; caption: string }) {
  return <DocTable head={["Key", "Action"]} rows={rows} caption={caption} />;
}

/** A short list of facts (label: value), for a command's aliases and argument. */
export function Facts({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 rounded-xl border border-border bg-card/60 p-4 text-sm sm:grid-cols-[auto_1fr]">
      {items.map((it) => (
        <div key={it.label} className="contents">
          <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground sm:pt-0.5">{it.label}</dt>
          <dd className="text-foreground">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
