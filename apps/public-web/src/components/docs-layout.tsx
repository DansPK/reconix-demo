import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronRight, Info, PencilLine, TriangleAlert } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { DocsSidebar } from "@/components/docs-sidebar";
import { Badge } from "@/components/ui/badge";
import { DocsToc } from "@/components/docs-toc";
import { docNeighbours, findDoc } from "@/lib/docs-nav";
import { cn } from "@/lib/utils";

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");


export function DocsLayout({
  href,
  title,
  lede,
  draft,
  notice,
  children,
}: {
  href: string;
  title?: string;
  lede: string;
  draft?: boolean;
  /** review-status line shown above the content (see DocumentationNotice) */
  notice?: string;
  children: React.ReactNode;
}) {
  const entry = findDoc(href);
  const heading = title ?? entry?.title ?? "Documentation";
  const { prev, next } = docNeighbours(href);
  const crumbs = [{ label: "Docs", href: "/docs" }];
  if (entry && entry.group.href !== "/docs") crumbs.push({ label: entry.group.title, href: entry.group.href });
  if (entry && !entry.isGroup) crumbs.push({ label: entry.title, href: entry.href });

  return (
    <main className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-12 lg:py-14 xl:grid-cols-[230px_minmax(0,1fr)_200px]">
      <DocsSidebar />

      <article className="min-w-0 max-w-3xl">
        <nav aria-label="Breadcrumb" className="mb-5">
          <ol className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {crumbs.map((c, i) => (
              <li key={c.href} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight className="size-3" aria-hidden />}
                {i < crumbs.length - 1 ? (
                  <Link href={c.href} className="hover:text-foreground">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-primary">
                    {c.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{heading}</h1>
        <p className="mt-4 text-lg leading-relaxed text-foreground/85 sm:text-xl">{lede}</p>

        <div data-docs-content className="mt-10 space-y-12">
          {draft && (
            <Callout variant="draft" title="Draft: content pending">
              This page is a placeholder. What is shown below is what the Reconix docs already state; the rest is still
              to be written.
            </Callout>
          )}
          {notice && <DocumentationNotice>{notice}</DocumentationNotice>}
          {children}
        </div>

        {(prev || next) && (
          <nav aria-label="Previous and next page" className="mt-16 grid gap-4 border-t border-border pt-8 sm:grid-cols-2">
            {prev ? (
              <Link
                href={prev.href}
                className="group rounded-xl border border-border bg-card/60 p-4 transition-colors hover:border-primary/50"
              >
                <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  <ArrowLeft className="size-3.5" aria-hidden /> Previous
                </span>
                <span className="mt-1.5 block font-display font-semibold text-foreground group-hover:text-primary">
                  {prev.title}
                </span>
              </Link>
            ) : (
              <span className="hidden sm:block" />
            )}
            {next && (
              <Link
                href={next.href}
                className="group rounded-xl border border-border bg-card/60 p-4 text-right transition-colors hover:border-primary/50"
              >
                <span className="flex items-center justify-end gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Next <ArrowRight className="size-3.5" aria-hidden />
                </span>
                <span className="mt-1.5 block font-display font-semibold text-foreground group-hover:text-primary">
                  {next.title}
                </span>
              </Link>
            )}
          </nav>
        )}
      </article>

      <DocsToc />
    </main>
  );
}

/** A titled section of a docs page; its id is the slug of the title (used by "On this page"). */
export function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 id={slugify(title)} data-toc className="scroll-mt-24 text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      {/* list-disc is scoped to ul: on an ol it would beat the list-decimal the list sets itself */}
      <div className="space-y-3 leading-relaxed text-muted-foreground [&_li]:ml-5 [&_ul_li]:list-disc [&_strong]:font-semibold [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

export function Code({ children }: { children: string }) {
  return (
    <div className="relative">
      {/* pr-14 keeps long lines from scrolling under the copy button */}
      <pre className="overflow-x-auto rounded-lg border border-border bg-card p-4 pr-14 font-mono text-[13px] leading-relaxed text-foreground">
        <code>{children}</code>
      </pre>
      <CopyButton value={children} className="absolute right-2 top-2" />
    </div>
  );
}

export function Mono({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">{children}</span>;
}

const CALLOUTS = {
  note: { icon: Info, box: "border-primary/30 bg-primary/5", tone: "text-primary" },
  warning: { icon: TriangleAlert, box: "border-accent/40 bg-accent/5", tone: "text-accent" },
  draft: { icon: PencilLine, box: "border-dashed border-muted-foreground/40 bg-muted/40", tone: "text-muted-foreground" },
} as const;

/** Note (teal), warning (amber, approval gates and risks) or draft (grey, content pending). */
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

/** Small "Read more" link used inside docs content. */
export function DocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-primary underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}

/**
 * Amber review-status notice. With `title` it is the page-level banner (adds an "In Progress"
 * badge); without it, the compact line shown above a single page's content.
 */
export function DocumentationNotice({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div
      role="note"
      className={cn(
        "flex gap-3 rounded-xl border border-accent/30 bg-accent/5 leading-relaxed text-muted-foreground",
        title ? "p-4 text-sm" : "px-4 py-3 text-[13px]"
      )}
    >
      <Info className={cn("size-4 shrink-0 text-accent", title ? "mt-0.5" : "mt-0.5 sm:mt-px")} aria-hidden />
      <div className="min-w-0 space-y-1.5">
        {title && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">{title}</p>
            <Badge variant="accent">In Progress</Badge>
          </div>
        )}
        <div>{children}</div>
      </div>
    </div>
  );
}
