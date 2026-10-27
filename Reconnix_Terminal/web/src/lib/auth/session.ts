/* Access to the local dashboard: a launch token and a signed session cookie. There are no
   roles: whoever signs in is the one local user, and every page and route opens to them.

   `npm start` / `npm run dev` (scripts/serve.mjs) make a new random token each time and
   print a sign-in link that carries it. The sign-in route trades the token for a cookie
   holding "<issued-at>.<HMAC(token, issued-at)>"; the server checks both, so a cookie stops
   working after 12 hours or when the dashboard restarts with a new token (cookies are per
   host, not per port: don't run untrusted services on 127.0.0.1). A cookie from before roles
   went ("<role>.<issued-at>.<signature>") no longer reads: its owner signs in again. */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE = "reconix_view";
export const MAX_AGE_SECONDS = 12 * 60 * 60;

/** The token this server was started with, or null (then nothing is served). */
export function launchToken(): string | null {
  const token = process.env.RECONIX_WEB_TOKEN?.trim();
  return token && token.length >= 16 ? token : null;
}

export function port(): string {
  return process.env.RECONIX_WEB_PORT || process.env.PORT || "3100";
}

/** Host headers the dashboard answers to (anything else is refused: DNS rebinding). */
export function allowedHosts(): string[] {
  return [`127.0.0.1:${port()}`, `localhost:${port()}`];
}

const sign = (issued: number, token: string) =>
  createHmac("sha256", token).update(`reconix-web:session:${issued}`).digest("base64url");

/** Constant-time equality (both sides are hashed first, so lengths never leak). */
function sameText(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

export const tokenMatches = (given: string, token: string) => sameText(given, token);

/** "<issued>.<signature>" signed by `signer`, when it is genuine and no older than 12 hours (a
    minute of clock skew allowed). Anything else, a third part included, does not read. */
function readSigned(value: string | undefined, signer: (issued: number) => string, now: number): boolean {
  const [issuedText, signature, ...rest] = (value ?? "").split(".");
  if (rest.length || !signature || !/^\d{1,12}$/.test(issuedText)) return false;
  const issued = Number(issuedText);
  const age = Math.floor(now / 1000) - issued;
  if (age < -60 || age > MAX_AGE_SECONDS) return false;
  return sameText(signature, signer(issued));
}

/** The session cookie's value, issued at `now` (ms). */
export function sessionValue(token: string, now: number = Date.now()): string {
  const issued = Math.floor(now / 1000);
  return `${issued}.${sign(issued, token)}`;
}

/** Whether a session cookie is genuine and current: false when it is missing, forged, expired,
    from another launch token or in the old role-prefixed form. */
export function readSession(value: string | undefined, token: string, now: number = Date.now()): boolean {
  return readSigned(value, (issued) => sign(issued, token), now);
}
