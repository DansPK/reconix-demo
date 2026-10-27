/* Sign-in: the link that /web opens (or `npm run dev` / `npm start` prints; scripts/serve.mjs)
   carries the launch token in the URL fragment. Rendered per request (`connection()`), because the proxy gives this page
   a CSP with a fresh nonce, which a prerendered page's scripts wouldn't carry. */
import type { Metadata } from "next";
import { connection } from "next/server";

import { SignIn } from "./sign-in";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function LoginPage() {
  await connection();
  return (
    <main className="dash-page grid min-h-screen place-items-center p-6">
      <div className="dash-card flex w-full max-w-[460px] flex-col items-center gap-4 px-7 py-9 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Reconix · sign-in</p>
        <SignIn />
      </div>
    </main>
  );
}
