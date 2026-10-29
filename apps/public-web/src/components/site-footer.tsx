import Link from "next/link";
import { CircleDot, ExternalLink, Link2, type LucideIcon } from "lucide-react";
import { siGithub } from "simple-icons";
import { NAV_MENUS, type NavMenu } from "@/components/nav-data";
import { DOCS_NAV } from "@/lib/docs-nav";
import { SITE_COMMUNITY, SITE_NAME_MEANING, SITE_OPEN_SOURCE, SITE_REPO_URL, SITE_TAGLINE } from "@/lib/site";
import { cn } from "@/lib/utils";

type FooterLink = { label: string; href: string; external?: boolean; icon?: LucideIcon };

const menu = (id: string) => NAV_MENUS.find((m) => m.id === id) as NavMenu;
const item = (id: string, href: string) => menu(id).items.find((i) => i.href === href)!;

// Every column is derived from the navbar data (NAV_MENUS), the docs structure (DOCS_NAV) or site.ts.
const PRODUCT: FooterLink[] = [
  { label: menu("features").label, href: menu("features").href },
  { label: item("features", "/#integrations").label, href: "/#integrations" },
  { label: menu("how").label, href: menu("how").href },
  { label: item("features", "/#categories").label, href: "/#categories" },
];
const DOCS: FooterLink[] = DOCS_NAV.filter((g) => g.id !== "guardrails").map((g) => ({ label: g.title, href: g.href }));
const GUARDRAILS: FooterLink[] = menu("guardrails").items.map((i) => ({ label: i.label, href: i.href }));
const COMMUNITY: FooterLink[] = [
  { label: "GitHub", href: SITE_REPO_URL, external: true },
  { label: "Issues", href: `${SITE_REPO_URL}/issues`, external: true, icon: CircleDot },
  ...SITE_COMMUNITY.map((c) => ({ ...c, external: !c.href.startsWith("mailto:") })),
];
const COLUMNS = [
  { title: "Product", links: PRODUCT },
  { title: "Documentation", links: DOCS },
  { title: "Guardrails", links: GUARDRAILS },
  { title: "Community", links: COMMUNITY },
];
/** The reviewer's one-line nav: the four menus' own destinations + GitHub. */
const INLINE: FooterLink[] = [
  ...NAV_MENUS.map((m) => ({ label: m.label, href: m.href })),
  { label: "GitHub", href: SITE_REPO_URL, external: true },
];

const linkClass =
  "rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function FooterAnchor({ link, className, children }: { link: FooterLink; className?: string; children: React.ReactNode }) {
  return link.external ? (
    <a href={link.href} target="_blank" rel="noopener noreferrer" className={cn(linkClass, className)}>
      {children}
    </a>
  ) : (
    <Link href={link.href} className={cn(linkClass, className)}>
      {children}
    </Link>
  );
}

function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("fill-current", className)} aria-hidden>
      <path d={siGithub.path} />
    </svg>
  );
}

/**
 * Site footer: brand block (wordmark, tagline, description, GitHub + community icons),
 * four link columns (Product / Documentation / Guardrails / Community) and a bottom bar with
 * the copyright, the one-line nav and the authorized-use note. Server component; all links
 * come from NAV_MENUS, DOCS_NAV, SITE_REPO_URL and SITE_COMMUNITY.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative border-t border-border bg-card/30">
      {/* faint teal light along the top edge, like the cards' lit edge */}
      <span aria-hidden className="footer-edge" />
      <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-12 pt-14 sm:px-6 lg:grid-cols-[1.35fr_2.65fr] lg:gap-16">
        <div className="max-w-sm">
          <Link href="/" className={cn(linkClass, "inline-block font-mono text-lg tracking-tight")}>
            <span className="text-muted-foreground">&lt;</span>
            <span className="font-semibold text-foreground">reconix</span>
            <span className="text-muted-foreground"> /&gt;</span>
          </Link>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
            {SITE_NAME_MEANING ?? SITE_TAGLINE}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
           AI-powered security assessments from one terminal.
Every action stays inside approved scope and policy.
Plan, approve, execute, analyze, and report with confidence.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2">
            <li>
              <a
                href={SITE_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Reconix on GitHub"
                className="grid size-10 place-items-center rounded-lg border border-border bg-background/60 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <GithubMark className="size-[18px]" />
              </a>
            </li>
            {SITE_COMMUNITY.map((c) => {
              const Icon = c.icon ?? Link2;
              return (
                <li key={c.href}>
                  <FooterAnchor
                    link={{ ...c, external: !c.href.startsWith("mailto:") }}
                    className="grid size-10 place-items-center rounded-lg border border-border bg-background/60 hover:border-primary/50 hover:text-primary"
                  >
                    <Icon className="size-[18px]" aria-hidden />
                    <span className="sr-only">{c.label}</span>
                  </FooterAnchor>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={`Footer: ${col.title}`} className="text-sm">
              <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/70">{col.title}</p>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <FooterAnchor link={l} className="inline-flex items-center gap-1.5">
                      {l.label === "GitHub" ? (
                        <GithubMark className="size-3.5" />
                      ) : (
                        l.icon && <l.icon className="size-3.5" aria-hidden />
                      )}
                      {l.label}
                      {l.external && <ExternalLink className="size-3 opacity-50" aria-hidden />}
                    </FooterAnchor>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto max-w-6xl space-y-3 px-4 py-6 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-xs text-muted-foreground">
              © {year} Reconix.{" "}
              {SITE_OPEN_SOURCE ? "Open-source security assessment platform." : "AI-powered security assessment assistant."}
            </p>
            <nav aria-label="Footer: quick links">
              <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.16em] sm:gap-x-0">
                {INLINE.map((l, i) => (
                  <li key={l.label} className="flex items-center">
                    {i > 0 && (
                      // separators only on one line (sm+); when the list wraps on phones it uses gaps instead
                      <span aria-hidden className="hidden px-2 text-muted-foreground/50 sm:inline">
                        ·
                      </span>
                    )}
                    <FooterAnchor link={l}>{l.label}</FooterAnchor>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <p className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground/80">
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-accent" />
            For authorized testing only. Approve the scope before anything runs.
          </p>
        </div>
      </div>
    </footer>
  );
}