"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The nav's "Get started". On the landing page the hero already shows one, so this
 * stays hidden (and inert) while `#hero` is on screen and fades in once it scrolls
 * away; on every other page it is always visible. Fade CSS: `.nav-cta` in globals.css.
 */
export function NavCta() {
  const pathname = usePathname();
  // only the landing page has a hero; elsewhere the observer never runs
  const [heroVisible, setHeroVisible] = useState(true);
  const hidden = pathname === "/" && heroVisible;

  useEffect(() => {
    const hero = document.getElementById("hero");
    if (!hero) return;
    // the sticky nav is 64px tall: count the hero as gone once it is behind the nav
    const io = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting), {
      rootMargin: "-64px 0px 0px 0px",
    });
    io.observe(hero);
    return () => io.disconnect();
  }, [pathname]);

  return (
    <Link
      href="/docs/getting-started"
      data-hidden={hidden}
      inert={hidden}
      className={cn(buttonVariants({ size: "sm" }), "nav-cta font-mono text-xs uppercase tracking-[0.14em]")}
    >
      Get started
    </Link>
  );
}
