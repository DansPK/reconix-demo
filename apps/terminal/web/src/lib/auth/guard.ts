/* A second lock behind src/proxy.ts: the data loader and the docs require a session
   themselves, so nothing renders even if a route ever slips past the proxy. */
import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { COOKIE, launchToken, readSession } from "./session";

/** Whether this browser is signed in. Reads the cookies first, so every page that checks it
    renders per request (never prerendered at build time, when there is no launch token). */
export async function signedIn(): Promise<boolean> {
  const jar = await cookies();
  const token = launchToken();
  return token ? readSession(jar.get(COOKIE)?.value, token) : false;
}

export async function requireSignedIn(): Promise<void> {
  if (!(await signedIn())) redirect("/login");
}
