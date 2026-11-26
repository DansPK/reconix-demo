"use client";

/* Full-screen Reconix logo splash shown once right after signing in from the TUI's `/web` link
   (never on plain reloads or client-side route transitions, and skipped under reduced motion).
   Hides the header logo until the splash logo lands on its exact bounding box, then hands off
   cleanly so there is no duplicate logo. */
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ReconixLogo } from "@/components/ui/reconix-logo";

const HOLD_MS = 1250;
const MAX_WAIT_MS = 4000;
const LAND_MS = 460;
const EXIT_MS = 580;
const SPLASH_KEY = "reconix.splash.pending";
export const SPLASH_EXIT_EVENT = "reconix-splash-exit";

/** Called by `/login` right after `/web` sign-in succeeds so the splash plays once on arrival. */
export function markSplashPending() {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    window.sessionStorage.setItem(SPLASH_KEY, "1");
    document.documentElement.dataset.reconixSplash = "active";
  } catch {
    // ignore when sessionStorage is unavailable
  }
}

function consumeSplashPending(): boolean {
  try {
    if (window.sessionStorage.getItem(SPLASH_KEY) !== "1") return false;
    window.sessionStorage.removeItem(SPLASH_KEY);
    return true;
  } catch {
    return false;
  }
}

type TargetDelta = { dx: number; dy: number; scale: number };

export function ReconixSplash() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<"show" | "exit" | "done">("done");
  const [delta, setDelta] = useState<TargetDelta | null>(null);
  const logoRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (pathname === "/login") return;
    if (!consumeSplashPending()) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    queueMicrotask(() => {
      setDelta(null);
      setPhase("show");
      setActive(true);
    });
  }, [pathname]);

  useEffect(() => {
    if (!active) return;
    document.documentElement.dataset.reconixSplash = "active";
    let exited = false;
    let holdDone = false;
    let landTimer = 0;
    let doneTimer = 0;
    let observer: MutationObserver | null = null;

    const startExit = () => {
      if (exited) return;
      exited = true;
      observer?.disconnect();
      observer = null;
      const logo = logoRef.current;
      const target = document.querySelector<HTMLElement>("[data-reconix-header-logo]");
      if (logo && target) {
        const from = logo.getBoundingClientRect();
        const to = target.getBoundingClientRect();
        if (from.width > 0 && to.width > 0) {
          setDelta({
            dx: to.left + to.width / 2 - (from.left + from.width / 2),
            dy: to.top + to.height / 2 - (from.top + from.height / 2),
            scale: to.width / from.width,
          });
        }
      }
      setPhase("exit");
      window.dispatchEvent(new Event(SPLASH_EXIT_EVENT));
      landTimer = window.setTimeout(() => {
        delete document.documentElement.dataset.reconixSplash;
      }, LAND_MS);
      doneTimer = window.setTimeout(() => {
        delete document.documentElement.dataset.reconixSplash;
        setPhase("done");
        setActive(false);
      }, EXIT_MS);
    };

    const tryExit = () => {
      if (!holdDone || exited) return;
      if (document.querySelector("[data-reconix-header-logo]")) {
        startExit();
      }
    };

    const holdTimer = window.setTimeout(() => {
      holdDone = true;
      tryExit();
    }, HOLD_MS);

    observer = new MutationObserver(tryExit);
    observer.observe(document.body, { childList: true, subtree: true });

    const maxWaitTimer = window.setTimeout(startExit, MAX_WAIT_MS);

    return () => {
      observer?.disconnect();
      delete document.documentElement.dataset.reconixSplash;
      window.clearTimeout(holdTimer);
      window.clearTimeout(maxWaitTimer);
      window.clearTimeout(landTimer);
      window.clearTimeout(doneTimer);
    };
  }, [active]);

  if (phase === "done") return null;

  const logoStyle = delta
    ? ({
        "--ac-dx": `${delta.dx}px`,
        "--ac-dy": `${delta.dy}px`,
        "--ac-scale": String(delta.scale),
      } as React.CSSProperties)
    : undefined;

  return (
    <div
      aria-hidden
      data-phase={phase}
      className="ac-splash fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-page px-6 text-center select-none"
    >
      <div className="ac-splash-glow pointer-events-none absolute h-[420px] w-[720px] rounded-full" />
      <div className="ac-splash-inner relative z-[1] flex flex-col items-center gap-4">
        <ReconixLogo
          ref={logoRef}
          decorative
          style={logoStyle}
          rowClassName="ac-splash-line"
          className="ac-splash-logo h-auto w-[clamp(300px,52vw,760px)] text-globe-glow"
        />
        <div className="ac-splash-tag flex flex-col items-center gap-1">
          <p className="text-[14px] font-medium text-foreground">AI-planned security assessments inside an approved scope.</p>
          <p className="text-[12.5px] text-muted-foreground">From scope manifest to report, every step approved by you.</p>
        </div>
      </div>
    </div>
  );
}
