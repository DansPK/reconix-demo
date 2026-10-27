/* How often the dashboard re-reads the saved assessments (components/dashboard/live-refresh.tsx):
   RECONIX_LIVE_REFRESH_MS, else 10 s; 0 turns it off (the e2e server sets 0). Read on the
   server (the top bar) and handed to the client pill as a prop: this module has no "use client",
   so a server component may call it. */

export const DEFAULT_REFRESH_MS = 10_000;

/** The interval the server configured: RECONIX_LIVE_REFRESH_MS, else the default; 0 = off. */
export function liveRefreshMs(env: string | undefined = process.env.RECONIX_LIVE_REFRESH_MS): number {
  const n = Number(env);
  return env !== undefined && env !== "" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_REFRESH_MS;
}
