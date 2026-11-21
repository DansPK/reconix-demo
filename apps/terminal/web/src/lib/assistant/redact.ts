/* Masking secrets an operator might paste into a question (a cookie, a bearer token, a URL with
   a password), before it is shown, kept in the tab, resent or sent to the model. The same
   patterns as the TUI's reconix/store/redact.py; tests/redact-vectors.json holds cases both
   test suites check, so the two stay in step. Pure: the browser and the server both use it. */

export const MASK = "••••";

/** `text` with each of `values` (secrets the server holds itself, such as the saved model API
    keys: lib/assistant/models/known-keys.ts) masked wherever it occurs as is, longest first; a
    value shorter than 4 characters is left alone (it would mask ordinary words). The TUI's
    store/known_secrets.py does the same inside its redact(). */
export function maskValues(text: string, values: readonly string[]): string {
  const kept = [...new Set(values.map((v) => v.trim()).filter((v) => v.length >= 4))].sort((a, b) => b.length - a.length);
  return kept.reduce((out, value) => out.split(value).join(MASK), text);
}

// Authorization schemes kept readable in front of the masked credential. A fixed list: a general
// "word, then a space" would read a bare key as its scheme and leave the key visible.
const SCHEMES = "bearer|basic|digest|token|negotiate|ntlm|dpop|apikey|aws4-hmac-sha256";

// Plain words after "the token is …" that are no secret (the TUI's redact.py: the same list)
const NOT_A_VALUE =
  "a|an|the|not|no|now|set|unset|empty|missing|invalid|expired|required|wrong|correct|valid|stored|saved|masked|hidden|needed|ok|in|on|from|being|still|also|only|never|always|used|sent|shown|kept|encrypted|this|that|it";

const PATTERNS: [RegExp, string][] = [
  // https://user:password@host → https://••••@host. The scheme starts where no scheme character
  // precedes it (a lookbehind, not \b): from every boundary inside a run such as "a.a.a.…" the
  // scheme would swallow the rest of the run and back off, quadratic in its length
  [/(?<![a-z0-9+.-])([a-z][a-z0-9+.-]*:\/\/)[^/\s@:]+:[^/\s@]*@/gi, `$1${MASK}@`],
  // Authorization: Bearer … → keep the header and the scheme, mask the credential
  [new RegExp(`\\b((?:proxy-)?authorization)\\b(\\s*[:=]\\s*)((?:${SCHEMES})\\s+)?("[^"]*"|'[^']*'|[^\\s,;&]+)`, "gi"), `$1$2$3${MASK}`],
  // Cookie: a=1; sid=2 → every cookie on the header line, not just the first
  [/\b((?:set-)?cookie)(\s*:\s*)[^\r\n]+/gi, `$1$2${MASK}`],
  // cookie=…, password=…, api_key: "…", DB_PASSWORD=…, OPENAI_API_KEY: … → keep the name, mask the
  // value. The keyword may end a longer name (an env-style "DB_", "AWS_SECRET_" or "x-" in front
  // stays as it is): it starts where no letter or digit precedes it ("bypass=1" and "compass: north"
  // are no secret) and ":" or "=" must follow it ("passport=" is none either). A lookbehind, not a
  // scanned name prefix: a prefix tried after every "_" of a long "a_a_a…" run would scan the rest
  // of the run each time, quadratic in its length
  [
    /(?<![a-z0-9])((?:set-)?cookie|pass|password|passwd|pwd|secret|client[_-]?secret|token|access[_-]?token|refresh[_-]?token|api[_-]?key|access[_-]?key|private[_-]?key|session[_-]?id|sessionid)(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&]+)/gi,
    `$1$2${MASK}`,
  ],
  // "my password is hunter2", "the api key is …", "token is …": the next word is the secret, unless
  // it is one of a few plain words ("the token is invalid", "the secret is not set")
  [
    new RegExp(`(?<![a-z0-9])(pass(?:word|phrase)|passwd|api[ _-]?key|token|secret)(\\s+is:?\\s+)(?!(?:${NOT_A_VALUE})(?![^\\s.,;:!?]))("[^"]*"|'[^']*'|\\S+)`, "gi"),
    `$1$2${MASK}`,
  ],
  [/\bbearer\s+[a-z0-9._~+/=-]{8,}/gi, `Bearer ${MASK}`],
  // A JWT starts where no base64url character precedes it (not \b, which also matches after each
  // "-" of a run like "eyJ-eyJ-…": every start would scan to the run's end, quadratic)
  [/(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, `${MASK} (JWT)`],
  [/\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, `$1${MASK}`],
  // Provider and service keys, by their fixed prefix (kept readable, as AKIA above): OpenAI /
  // Anthropic sk-… (sk-proj-, sk-ant-), GitHub tokens, Google API keys, Slack tokens. Each starts
  // where no key character precedes it ("task-…" is no key) and needs a long body, so short ids
  // ("sk-1") stay
  [/(?<![A-Za-z0-9_-])(sk-(?:proj-|ant-)?)[A-Za-z0-9_-]{20,}/g, `$1${MASK}`],
  [/(?<![A-Za-z0-9_])(gh[pousr]_)[A-Za-z0-9]{36,}/g, `$1${MASK}`],
  [/(?<![A-Za-z0-9_])(github_pat_)[A-Za-z0-9_]{22,}/g, `$1${MASK}`],
  [/(?<![A-Za-z0-9_-])(AIza)[0-9A-Za-z_-]{35,}/g, `$1${MASK}`],
  [/(?<![A-Za-z0-9-])(xox[abprs]-)[A-Za-z0-9-]{10,}/g, `$1${MASK}`],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, `${MASK} (private key)`],
];

/* Control characters and terminal escape sequences, as the TUI's redact.py handles them.
   Dropping them glued the words around them ("10.0.0.1<ESC>[31mtoken=x" became "10.0.0.1token=x",
   and "token=" was no longer masked); a space instead can split a secret's name ("pass<NUL>word=x"
   became "pass word=x"). So every sequence and control character becomes one space
   (`stripControls`), and a line where some reading of it holds something the masking hides
   (`escapedSecret`) is hidden whole (`HIDDEN_LINE`). */

export const HIDDEN_LINE = "[line hidden: control codes around a secret]";

// Every control (Cc: C0 but tab and line feed, DEL, C1 — U+009B is an 8-bit CSI and U+009D an 8-bit
// OSC) and format character (Cf: zero-width, bidi marks and isolates, soft hyphen, BOM, tags…),
// plus invisible characters of other classes (combining grapheme joiner, Mongolian variation
// selectors, variation selectors, Hangul fillers), the two non-characters and a lone carriage return
// (CR LF stays a line break): any of them would split "token=" or "password" so the patterns miss
// it. The TUI's redact.py builds the same set from unicodedata.
const CLASS =
  "\\p{Cc}\\p{Cf}\\u034f\\u115f\\u1160\\u180b-\\u180f\\u3164\\ufe00-\\ufe0f\\uffa0\\ufffe\\uffff\\u{E0000}-\\u{E007F}\\u{E0100}-\\u{E01EF}";
const CONTROL_SOURCE = `(?![\\t\\n\\r])[${CLASS}]|\\r(?!\\n)`;
const CONTROL = new RegExp(CONTROL_SOURCE, "gu");
// The same with the tab: `stripControls` keeps a tab, but one inside a secret's name splits it the
// way the other controls do ("pass<TAB>word=…" read "pass word=…"), so the hidden-secret check
// (`escapedSecret`) treats it as one of them (the TUI's _CONTROL_TAB)
const CONTROL_TAB_SOURCE = `(?![\\n\\r])[${CLASS}]|\\r(?!\\n)`;
const CONTROL_TAB = new RegExp(CONTROL_TAB_SOURCE, "gu");
const HAS_CONTROL_TAB = new RegExp(CONTROL_TAB_SOURCE, "u"); // no "g": `test` keeps no state
// One whole sequence: CSI (ESC [ or U+009B, its parameter and intermediate bytes, then a final byte
// or the line's end), OSC / DCS / SOS / PM / APC (ESC ] P X ^ _ or U+009D / 0090 / 0098 / 009E /
// 009F \u2026 BEL, ESC \, U+009C or the line's end) and the short ESC forms (ESC, any intermediate
// bytes, one final byte: ESC ( B, ESC M\u2026)
const SEQUENCE =
  /(?:\x1b\[|\x9b)[0-?]*[ -\/]*[@-~]?|(?:\x1b[\]PX^_]|[\x90\x98\x9d\x9e\x9f])[^\x07\x1b\x9c\n]*(?:\x07|\x1b\\|\x9c)?|\x1b[ -\/]*[0-~]?/g;
// A CSI read as if only its introducer and parameters were there: "<ESC>[31token=x" is a CSI whose
// final byte is the "t" of "token", which a terminal eats; masking must still see it
const CSI_HEAD = /(?:\x1b\[|\x9b)[0-?]*/g;
// A lone surrogate can't be encoded: "?" as the TUI's encode("utf-8", "replace") gives
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

const encodable = (text: string): string => text.replace(LONE_SURROGATE, "?");

const mask = (text: string): string =>
  PATTERNS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);

/** `text` with every terminal escape sequence and every other control or invisible character
    turned into one space; tab and line breaks stay. */
export function stripControls(text: string): string {
  return text.replace(SEQUENCE, " ").replace(CONTROL, " ");
}

/** `text` holds a terminal escape sequence or control/invisible character (a tab counts) AND some
    reading of it holds something the masking hides: glued (each removed), spaced (`stripControls`,
    the tab a space too), only the control bytes dropped or each a space (the sequence's text stays:
    "<ESC>token=" is an ESC form that eats the "t"), or only a CSI's introducer and parameters
    dropped. */
export function escapedSecret(text: string): boolean {
  const plain = encodable(text);
  if (!HAS_CONTROL_TAB.test(plain)) return false;
  const readings = [
    plain.replace(SEQUENCE, "").replace(CONTROL_TAB, ""),
    plain.replace(SEQUENCE, " ").replace(CONTROL_TAB, " "),
    plain.replace(CONTROL_TAB, ""),
    plain.replace(CONTROL_TAB, " "),
    plain.replace(CSI_HEAD, "").replace(CONTROL_TAB, ""),
  ];
  return [...new Set(readings)].some((reading) => mask(reading) !== reading); // each distinct reading once
}

/** `text` ready for the patterns: every line hiding a secret behind control characters replaced
    whole, then every sequence and control character a space (the TUI's clean(_hide_lines(\u2026))). */
export function prepare(text: string): string {
  const plain = encodable(text);
  const shown = HAS_CONTROL_TAB.test(plain)
    ? plain.split("\n").map((line) => (escapedSecret(line) ? HIDDEN_LINE : line)).join("\n")
    : plain;
  return stripControls(shown);
}

/** The patterns alone, on text `prepare` already made ready (lib/report/mask.ts joins prepared
    elements with a NUL separator first, which `prepare` would turn into a space). */
export const maskPrepared = mask;

/** `text` with credentials, tokens and keys masked; a line hiding a secret behind control
    characters (`escapedSecret`) becomes `HIDDEN_LINE`. */
export function redact(text: string): string {
  return mask(prepare(text));
}
