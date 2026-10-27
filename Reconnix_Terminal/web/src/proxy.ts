/* Runs before every page and route: refuses foreign Host headers, requires a session (except
   for the sign-in page and route; there are no roles: signed in, everything opens), and sets the
   strict Content-Security-Policy from lib/auth/csp.ts with a fresh script nonce (not on a
   knowledge file's original, which sets a stricter one). */
import { type NextRequest, NextResponse } from "next/server";

import { contentSecurityPolicy } from "@/lib/auth/csp";
import { COOKIE, allowedHosts, launchToken, readSession } from "@/lib/auth/session";
import { isKnowledgeOriginalPath } from "@/lib/knowledge/paths";

const PUBLIC_PATHS = new Set(["/login", "/api/session"]);

export function proxy(request: NextRequest) {
  const token = launchToken();
  if (!token) {
    return new NextResponse("Start the dashboard with `npm start`; it creates the sign-in link.", { status: 503 });
  }
  if (!allowedHosts().includes(request.headers.get("host") ?? "")) {
    return new NextResponse("This dashboard only answers on 127.0.0.1.", { status: 403 });
  }

  const { pathname } = request.nextUrl;
  if (!PUBLIC_PATHS.has(pathname) && !readSession(request.cookies.get(COOKIE)?.value, token)) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ detail: "Sign in first." }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }
  // a knowledge file's original carries its own policy (a sandbox with nothing allowed): the
  // page's policy set here would replace it
  if (isKnowledgeOriginalPath(pathname)) return NextResponse.next();

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy(nonce);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico).*)" }],
};
