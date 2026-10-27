"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  FileText,
  Layers,
  LayoutGrid,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { View } from "@/components/dashboard/view-url";
import { DOCS } from "@/lib/docs-nav";

type NavItem = { icon: LucideIcon; label: string; view: View };
type DocItem = { icon: LucideIcon; label: string; href: string };

const VIEWS: NavItem[] = [
  { icon: LayoutGrid, label: "Overview", view: "overview" },
  { icon: Sparkles, label: "AI Assistant", view: "assistant" },
  { icon: Layers, label: "Assessments", view: "assessments" },
  { icon: TriangleAlert, label: "Findings", view: "findings" },
  { icon: FileText, label: "Reports", view: "reports" },
];
const DOC_ITEMS: DocItem[] = [
  { icon: BookOpen, label: "Documentation", href: DOCS.home },
];

/** A view's own address, for the sidebar outside the viewer (the docs): a plain link to `/`. */
const viewHref = (view: View): string => (view === "overview" ? "/" : `/?view=${view}`);

const NAV_CLASS = "dash-navbtn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The rail (no logo at its top): the views, then the docs. Inside the viewer (`onSelect` given) a
 * view is a button that switches in place; on the docs pages (`active` null) it is a link back to that view at `/`, and
 * the Documentation item is the one marked (the docs have no other item: no Settings).
 */
export function Sidebar({ active, onSelect }: { active: View | null; onSelect?: (v: View) => void }) {
  const pathname = usePathname();
  // every docs page marks Documentation
  const docActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return (
    <aside className="dash-sidebar flex items-center border-border">
      <nav aria-label="Views" className="flex flex-1 flex-col items-center gap-2 py-3">
        {VIEWS.map((item) => {
          const Icon = item.icon;
          const label = item.label;
          const content = (
            <>
              {item.view === "assistant" ? (
                // breathes with the open assistant (breath.ts); only the icon scales, the button
                // and its click area stay put
                <span className="dash-ai-icon" data-breath="scale" aria-hidden>
                  <span className="dash-ai-halo" data-breath="glow" />
                  <Icon className="size-[18px]" strokeWidth={1.6} />
                </span>
              ) : (
                <Icon className="size-[18px]" strokeWidth={1.6} aria-hidden />
              )}
              <span role="tooltip" className="dash-tip">
                {label}
              </span>
            </>
          );
          return onSelect ? (
            <button
              key={item.view}
              type="button"
              onClick={() => onSelect(item.view)}
              data-view={item.view}
              // the active marker (.dash-navbtn::after, motion.css) slides in once on this
              // attribute: no loop, nothing on the icon or the label
              data-active={active === item.view ? "true" : undefined}
              aria-current={active === item.view ? "page" : undefined}
              aria-label={label}
              className={NAV_CLASS}
            >
              {content}
            </button>
          ) : (
            <Link key={item.view} href={viewHref(item.view)} data-view={item.view} aria-label={label} className={NAV_CLASS}>
              {content}
            </Link>
          );
        })}
      </nav>
      <div className="flex flex-col items-center gap-2 pb-3">
        {DOC_ITEMS.map((item) => {
          const Icon = item.icon;
          const here = active === null && docActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              data-active={here ? "true" : undefined}
              aria-current={here ? "page" : undefined}
              className={NAV_CLASS}
            >
              <Icon className="size-[18px]" strokeWidth={1.6} aria-hidden />
              <span role="tooltip" className="dash-tip">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
