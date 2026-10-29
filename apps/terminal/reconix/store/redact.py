"""Masking secrets that ride along in free text (typed requests, tool output, URLs).

The vault keeps real credentials out of the data model, but an operator can still type
`https://user:pass@host`, paste a cookie into the prompt, or import tool output whose
evidence holds a token. `redact()` masks the common shapes of those before text is saved
or imported; `clean()` drops characters that can't be encoded (lone surrogates from a
crafted JSON file) and the control characters XML can't hold (NUL, ESC…; tab and line
breaks stay), so a bad import can never crash a save, a redraw or a Word report.
`redact_all()` masks a list of strings as one text (`redact_lines`), so a private key stored
as one evidence entry per line is masked whole, as the web's lib/report/mask.ts does.
"""

import re
from typing import Any, List

MASK = "••••"

# Authorization schemes kept readable in front of the masked credential. A fixed list: a general
# "word, then a space" would read a bare key as its scheme and leave the key visible.
_SCHEMES = r"bearer|basic|digest|token|negotiate|ntlm|dpop|apikey|aws4-hmac-sha256"

_PATTERNS = (
    # https://user:password@host → https://••••@host. The scheme starts where no scheme
    # character precedes it (a lookbehind, not \b): from every boundary inside a run such as
    # "a.a.a.…" the scheme would swallow the rest of the run and back off, quadratic in its length
    (re.compile(r"(?i)(?<![a-z0-9+.-])([a-z][a-z0-9+.-]*://)[^/\s@:]+:[^/\s@]*@"),
     rf"\g<1>{MASK}@"),
    # Authorization: Bearer … → keep the header and the scheme, mask the credential
    (re.compile(r"(?i)\b((?:proxy-)?authorization)\b(\s*[:=]\s*)((?:" + _SCHEMES + r")\s+)?"
                r"(\"[^\"]*\"|'[^']*'|[^\s,;&]+)"), rf"\g<1>\g<2>\g<3>{MASK}"),
    # Cookie: a=1; sid=2 → every cookie on the header line, not just the first
    (re.compile(r"(?i)\b((?:set-)?cookie)(\s*:\s*)[^\r\n]+"), rf"\g<1>\g<2>{MASK}"),
    # cookie=…, password=…, api_key: "…" → keep the name, mask the value
    (re.compile(
        r"(?i)\b((?:set-)?cookie|password|passwd|pwd|secret|"
        r"client[_-]?secret|token|access[_-]?token|refresh[_-]?token|api[_-]?key|"
        r"access[_-]?key|session[_-]?id|sessionid)\b(\s*[:=]\s*)(\"[^\"]*\"|'[^']*'|[^\s,;&]+)"),
     rf"\g<1>\g<2>{MASK}"),
    (re.compile(r"(?i)\bbearer\s+[a-z0-9._~+/=-]{8,}"), f"Bearer {MASK}"),
    # A JWT starts where no base64url character precedes it (not \b, which also matches after
    # each "-" of a run like "eyJ-eyJ-…": every start would scan to the run's end, quadratic)
    (re.compile(r"(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"),
     f"{MASK} (JWT)"),
    (re.compile(r"\b(AKIA|ASIA)[0-9A-Z]{16}\b"), rf"\g<1>{MASK}"),
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)"),
     f"{MASK} (private key)"),
)


# C0 controls but tab, LF and CR, and the two non-characters: XML 1.0 can't hold them (a Word
# report would fail on them) and a terminal would act on them (ESC sequences)
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]")


def clean(text: str) -> str:
    """`text` without characters that can't be encoded as UTF-8 (lone surrogates) and without
    control characters other than tab and line breaks."""
    return _CONTROL.sub("", text.encode("utf-8", "replace").decode("utf-8"))


def _mask(text: str) -> str:
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def redact(text: str) -> str:
    """`text` with credentials, tokens and keys masked."""
    return _mask(clean(text))


def redact_lines(items: List[str]) -> List[str]:
    """A list of strings masked as one text, then split back on the element boundaries.

    The elements are joined by a separator that starts and ends with a newline (so a value or
    a header line ends at an element's end, as at a line's end) around a NUL-delimited core no
    element holds (`clean()` drops NUL; the round trip is checked all the same), so the split is
    exact. A match that ran across elements — a private key stored one line per element, which
    element by element would leave its middle lines bare — makes the elements it covered one.
    """
    if not items:
        return []
    items = [clean(item) for item in items]
    n = 0
    while True:
        separator = f"\n\x00{n}\x00\n"
        if (not any(f"\x00{n}\x00" in item for item in items)
                and separator.join(items).split(separator) == items):
            break
        n += 1
    return _mask(separator.join(items)).split(separator)


def redact_all(value: Any) -> Any:
    """`redact()` every string inside nested dicts, lists and tuples (a list of strings as one
    text, `redact_lines`)."""
    if isinstance(value, str):
        return redact(value)
    if isinstance(value, dict):
        return {key: redact_all(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        if value and all(isinstance(item, str) for item in value):
            return redact_lines(list(value))
        return [redact_all(item) for item in value]
    return value
