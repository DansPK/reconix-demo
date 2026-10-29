import Link from "next/link";
import { GithubLink } from "@/components/github-link";
import { MobileMenu, NavMenus } from "@/components/nav-menu";
import { NavCta } from "@/components/nav-cta";

/**
 * Sticky site header: wordmark, the four dropdowns (NavMenus, md+), GitHub, the "Get started"
 * CTA (NavCta hides it while the hero is on screen) and the mobile menu (< md).
 * The header is the positioning parent for the mobile panel (backdrop-blur makes it the
 * containing block for anything fixed inside it, so the panel is absolute instead).
 */
export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur">
      <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="font-mono text-base tracking-tight">
          <span className="text-muted-foreground">&lt;</span>
          <span className="font-semibold text-foreground">reconix</span>
          <span className="text-muted-foreground"> /&gt;</span>
        </Link>
        <NavMenus />
        <div className="flex items-center gap-2 sm:gap-3">
          <GithubLink className="hidden size-9 justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:inline-flex" />
          <NavCta />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
