/* Masking secrets an operator might paste into a question (a cookie, a bearer token, a URL with
   a password), before it is shown, kept in the tab, resent or sent to the model. The same
   patterns as the TUI's reconix/store/redact.py; tests/redact-vectors.json holds cases both
   test suites check, so the two stay in step. Pure: the browser and the server both use it. */

export const MASK = "••••";

// Authorization schemes kept readable in front of the masked credential. A fixed list: a general
// "word, then a space" would read a bare key as its scheme and leave the key visible.
const SCHEMES = "bearer|basic|digest|token|negotiate|ntlm|dpop|apikey|aws4-hmac-sha256";

const PATTERNS: [RegExp, string][] = [
  // https://user:password@host → https://••••@host. The scheme starts where no scheme character
  // precedes it (a lookbehind, not \b): from every boundary inside a run such as "a.a.a.…" the
  // scheme would swallow the rest of the run and back off, quadratic in its length
  [/(?<![a-z0-9+.-])([a-z][a-z0-9+.-]*:\/\/)[^/\s@:]+:[^/\s@]*@/gi, `$1${MASK}@`],
  // Authorization: Bearer … → keep the header and the scheme, mask the credential
  [new RegExp(`\\b((?:proxy-)?authorization)\\b(\\s*[:=]\\s*)((?:${SCHEMES})\\s+)?("[^"]*"|'[^']*'|[^\\s,;&]+)`, "gi"), `$1$2$3${MASK}`],
  // Cookie: a=1; sid=2 → every cookie on the header line, not just the first
  [/\b((?:set-)?cookie)(\s*:\s*)[^\r\n]+/gi, `$1$2${MASK}`],
  // cookie=…, password=…, api_key: "…" → keep the name, mask the value
  [
    /\b((?:set-)?cookie|password|passwd|pwd|secret|client[_-]?secret|token|access[_-]?token|refresh[_-]?token|api[_-]?key|access[_-]?key|session[_-]?id|sessionid)\b(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&]+)/gi,
    `$1$2${MASK}`,
  ],
  [/\bbearer\s+[a-z0-9._~+/=-]{8,}/gi, `Bearer ${MASK}`],
  // A JWT starts where no base64url character precedes it (not \b, which also matches after each
  // "-" of a run like "eyJ-eyJ-…": every start would scan to the run's end, quadratic)
  [/(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, `${MASK} (JWT)`],
  [/\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, `$1${MASK}`],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, `${MASK} (private key)`],
];

/** `text` with credentials, tokens and keys masked. */
export function redact(text: string): string {
  return PATTERNS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
}
