import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { slugify } from "@/components/docs-layout";
import type { DocGroup, DocPage } from "@/lib/docs-nav";
import { cn } from "@/lib/utils";

/** Sub links a card shows before the rest fold into "+N more" (the group landing lists them all). */
const SHOWN_LINKS = 2;

/** A card's sub links: its pages, or for a single-page group its sections as #anchors. */
function subLinks(g: DocGroup): { label: string; href: string; more?: boolean; ariaLabel?: string }[] {
  const all = g.pages.length
    ? g.pages.map((p) => ({ label: p.title, href: p.href }))
    : (g.sections ?? []).map((s) => ({ label: s, href: `${g.href}#${slugify(s)}` }));
  if (all.length <= SHOWN_LINKS) return all;
  const kind = g.pages.length ? "pages" : "sections";
  return [
    ...all.slice(0, SHOWN_LINKS),
    { label: `+${all.length - SHOWN_LINKS} more`, href: g.href, more: true, ariaLabel: `All ${all.length} ${g.title} ${kind}` },
  ];
}

/**
 * Card grid of docs groups (docs overview). Every card is the same height (`auto-rows-fr`) and
 * ends in the same one-row sub-link block (SHOWN_LINKS chips + "+N more"), so the divider sits at
 * the same height in every card. The row never wraps: if it gets tight, labels truncate instead.
 */
export function DocGroupCards({ groups }: { groups: DocGroup[] }) {
  return (
    <ul className="grid auto-rows-fr gap-4 md:grid-cols-2 !ml-0 [&>li]:!ml-0 [&>li]:!list-none">
      {groups.map((g) => {
        const Icon = g.icon;
        return (
          <li key={g.id} className="integration-card flex flex-col gap-4 rounded-2xl border p-5">
            <Link href={g.href} className="group flex items-start gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                <Icon className="size-5" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-display text-lg font-semibold text-foreground group-hover:text-primary">
                  {g.title}
                  <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{g.description}</span>
              </span>
            </Link>
            <div className="mt-auto border-t border-border/70 pt-4">
              <ul className="flex gap-2 !ml-0 [&>li]:!ml-0 [&>li]:!list-none">
                {subLinks(g).map((l) => (
                  <li key={l.href + l.label} className={l.more ? "shrink-0" : "min-w-0"}>
                    <Link
                      href={l.href}
                      aria-label={l.ariaLabel}
                      className={cn(
                        "block truncate rounded-md border px-2.5 py-1 text-xs transition-colors hover:border-primary/50 hover:text-primary",
                        l.more ? "border-primary/30 bg-primary/5 text-primary" : "border-border bg-background/50 text-foreground/85"
                      )}
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** List of a group's pages with descriptions (group landing pages). */
export function DocPageCards({ pages }: { pages: DocPage[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 !ml-0 [&>li]:!ml-0 [&>li]:!list-none">
      {pages.map((p) => (
        <li key={p.href}>
          <Link
            href={p.href}
            className="group flex h-full flex-col rounded-xl border border-border bg-card/60 p-4 transition-colors hover:border-primary/50"
          >
            <span className="flex items-center justify-between gap-2 font-display font-semibold text-foreground group-hover:text-primary">
              {p.title}
              <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
            </span>
            <span className="mt-1 text-sm text-muted-foreground">{p.description}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
