"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ChevronDown, Menu, X } from "lucide-react";
import { GithubLink } from "@/components/github-link";
import { NAV_MENUS, type NavItem, type NavMenu } from "@/components/nav-data";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Close a menu when the route changes ("adjust state on prop change", no effect needed). */
function useCloseOnRouteChange(close: () => void) {
  const pathname = usePathname();
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    close();
  }
}

function Item({ item, onNavigate, compact }: { item: NavItem; onNavigate: () => void; compact?: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "group flex items-start gap-3 rounded-lg outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
        compact ? "px-2 py-2" : "p-2.5"
      )}
    >
      {Icon ? (
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
          <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
        </span>
      ) : (
        <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/70" />
      )}
      <span className="min-w-0">
        <span className="block text-sm font-semibold normal-case tracking-normal text-foreground group-hover:text-primary">
          {item.label}
        </span>
        <span className="mt-0.5 block text-[13px] normal-case leading-snug tracking-normal text-muted-foreground">
          {item.description}
        </span>
      </span>
    </Link>
  );
}

/**
 * Desktop (md+) dropdowns for NAV_MENUS. Opens on hover (short delay, so passing over the bar
 * does not flash panels) and on click; Escape closes and returns focus to the trigger;
 * outside click, Tab-ing away, choosing an item and route changes close it. Panels are centred
 * under the whole nav (the <nav> is the positioning parent) so they never run off-screen.
 */
export function NavMenus() {
  const [open, setOpen] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({});
  const uid = useId();

  useCloseOnRouteChange(() => setOpen(null));

  const schedule = (next: string | null, ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), ms);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        triggers.current[open]?.focus();
        setOpen(null);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // ArrowDown on a trigger: once that panel is rendered visible, move focus to its first item
  const focusFirst = useRef<string | null>(null);
  useEffect(() => {
    if (!open || focusFirst.current !== open) return;
    focusFirst.current = null;
    document.getElementById(`${uid}-${open}`)?.querySelector<HTMLElement>("a")?.focus();
  }, [open, uid]);

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>, m: NavMenu) => {
    if (e.key !== "ArrowDown") return;
    e.preventDefault();
    focusFirst.current = m.id;
    setOpen(m.id);
  };

  return (
    <nav ref={rootRef} aria-label="Main" className="relative hidden items-center gap-1 md:flex">
      {NAV_MENUS.map((m) => {
        const isOpen = open === m.id;
        return (
          <div
            key={m.id}
            onPointerEnter={(e) => e.pointerType === "mouse" && schedule(m.id, open ? 0 : 90)}
            onPointerLeave={(e) => e.pointerType === "mouse" && schedule(null, 160)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen((o) => (o === m.id ? null : o));
            }}
          >
            <button
              ref={(el) => {
                triggers.current[m.id] = el;
              }}
              type="button"
              aria-expanded={isOpen}
              aria-controls={`${uid}-${m.id}`}
              onClick={() => setOpen(isOpen ? null : m.id)}
              onKeyDown={(e) => onTriggerKey(e, m)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isOpen ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m.label}
              <ChevronDown className={cn("size-3.5 transition-transform", isOpen && "rotate-180 text-primary")} aria-hidden />
            </button>
            <div
              id={`${uid}-${m.id}`}
              hidden={!isOpen}
              className={cn(
                "nav-panel absolute left-1/2 top-full z-50 -translate-x-1/2 pt-3",
                m.columns === 2 ? "w-[min(36rem,calc(100vw-2rem))]" : "w-[min(22rem,calc(100vw-2rem))]"
              )}
            >
              <div className="rounded-2xl border border-border bg-card p-2 shadow-2xl shadow-black/50">
                <p className="px-2.5 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-primary">{m.label}</p>
                <ul className={cn("grid gap-0.5", m.columns === 2 && "grid-cols-2")}>
                  {m.items.map((item) => (
                    <li key={item.href}>
                      <Item item={item} onNavigate={() => setOpen(null)} compact={!item.icon} />
                    </li>
                  ))}
                </ul>
                {m.footer && (
                  <Link
                    href={m.footer.href}
                    onClick={() => setOpen(null)}
                    className="mt-1 flex items-center justify-between rounded-lg border-t border-border px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-primary hover:bg-muted"
                  >
                    {m.footer.label}
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

/**
 * Mobile (< md) menu: a button that opens a full-height panel under the header with every
 * NAV_MENUS group as an accordion, plus GitHub and Get started. The panel is its own vertical
 * scroller, so it carries data-lenis-prevent.
 */
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<string | null>(null);
  const uid = useId();

  useCloseOnRouteChange(() => setOpen(false));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${uid}-panel`}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((o) => !o)}
        className="grid size-10 place-items-center rounded-md border border-border text-foreground"
      >
        {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
      </button>
      <div
        id={`${uid}-panel`}
        hidden={!open}
        data-lenis-prevent
        className="nav-panel absolute inset-x-0 top-full h-[calc(100dvh-4rem)] overflow-y-auto border-t border-border bg-background px-4 pb-10 pt-4"
      >
        <ul className="space-y-1">
          {NAV_MENUS.map((m) => {
            const expanded = section === m.id;
            return (
              <li key={m.id} className="border-b border-border/70">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`${uid}-${m.id}`}
                  onClick={() => setSection(expanded ? null : m.id)}
                  className="flex w-full items-center justify-between py-4 font-mono text-sm uppercase tracking-[0.16em] text-foreground"
                >
                  {m.label}
                  <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180 text-primary")} aria-hidden />
                </button>
                <ul id={`${uid}-${m.id}`} hidden={!expanded} className="space-y-0.5 pb-3">
                  {m.items.map((item) => (
                    <li key={item.href}>
                      <Item item={item} onNavigate={() => setOpen(false)} compact={!item.icon} />
                    </li>
                  ))}
                  {m.footer && (
                    <li>
                      <Link
                        href={m.footer.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 px-2.5 py-2 text-sm font-medium text-primary"
                      >
                        {m.footer.label} <ArrowRight className="size-4" aria-hidden />
                      </Link>
                    </li>
                  )}
                </ul>
              </li>
            );
          })}
        </ul>
        <div className="mt-6 flex flex-col gap-3">
          <Link
            href="/docs/getting-started"
            onClick={() => setOpen(false)}
            className={cn(buttonVariants({ size: "lg" }), "font-mono text-xs uppercase tracking-[0.14em]")}
          >
            Get started
          </Link>
          <GithubLink
            label="Reconix on GitHub"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "font-mono text-xs uppercase tracking-[0.14em]")}
          />
        </div>
      </div>
    </div>
  );
}
