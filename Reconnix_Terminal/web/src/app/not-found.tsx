/* Any unknown address: a way back to the dashboard (no dead ends). */
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="dash-page grid min-h-screen place-items-center p-6">
      <div className="dash-card flex w-full max-w-[460px] flex-col items-center gap-3 px-7 py-9 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">404</p>
        <h1 className="text-[18px] font-medium text-foreground">Nothing here</h1>
        <p className="text-sm text-muted-foreground">This address isn&apos;t part of the dashboard.</p>
        <Link href="/" className="rounded-sm text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Open the dashboard
        </Link>
      </div>
    </main>
  );
}
