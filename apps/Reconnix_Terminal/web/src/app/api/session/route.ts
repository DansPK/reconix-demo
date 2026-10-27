/* Sign-in: trade the launch token for the session cookie (see lib/auth/session.ts). There are
   no roles. */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { isSameOrigin } from "@/lib/auth/origin";
import { COOKIE, MAX_AGE_SECONDS, launchToken, sessionValue, tokenMatches } from "@/lib/auth/session";

const Body = z.object({ token: z.string().min(1).max(200) });

export async function POST(request: Request) {
  const token = launchToken();
  if (!token) return NextResponse.json({ detail: "The dashboard was not started with npm start." }, { status: 503 });

  if (!isSameOrigin(request)) {
    return NextResponse.json({ detail: "Sign in from the dashboard page." }, { status: 403 });
  }

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success || !tokenMatches(body.data.token, token)) {
    return NextResponse.json({ detail: "This sign-in link is not valid any more." }, { status: 401 });
  }

  const jar = await cookies();
  jar.set(COOKIE, sessionValue(token), {
    httpOnly: true,
    sameSite: "strict",
    secure: false, // http on 127.0.0.1 only
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return NextResponse.json({ signedIn: true });
}
