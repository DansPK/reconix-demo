"""Read a plain-language request into a ParsedTarget — rule-based, no LLM.

The shape of the target picks the template: an IPv4 address or range is a Network, an
http(s) URL a Web URL (an API when its path or a keyword says so), a git repo or a local
path Source Code. Those leave no doubt, so the template is applied without asking. A bare
hostname could be any of them, so it is marked not confident and the operator picks one.
Keywords ("api", "ports", "repo", "website", …) only break ties.

Returns None when the text names no target (small talk, or "scan my network" without an
address): the run then answers instead of starting. The values themselves are read by
`targets`, which raises on a malformed one (10.0.0.300, a range wider than /16).
"""

import re
from dataclasses import replace
from typing import Optional, Pattern, Tuple

from ..models.parser import ParsedTarget
from . import targets


def _words(*words: str) -> Pattern:
    return re.compile(r"\b(?:" + "|".join(words) + r")\b", re.IGNORECASE)


# Checked in this order (the more specific kind first). Whole words only: "reports" is
# not "ports", "digital" is not "git".
KEYWORDS: Tuple[Tuple[str, Pattern], ...] = (
    ("api", _words("apis?", "graphql", "endpoints?", "swagger", "openapi")),
    ("network", _words("network", "ports?", "port ?scan", "nmap", "subnet", "cidr",
                       "ip range")),
    ("source", _words("repo", "repos", "repository", "source ?code", "source", "codebase",
                      "code review", "static review", "sast", "git")),
    ("web_url", _words("website", "web ?site", "web ?app", "web application", "site", "url",
                       "web")),
)


def keyword_hint(text: str) -> Optional[str]:
    """The template a keyword points to, or None."""
    for template_id, pattern in KEYWORDS:
        if pattern.search(text):
            return template_id
    return None


# --- intent on the same line ("… scan port 80 with nmap") ------------------------------------
# A "port"/"ports" clause and the numbers that follow it (commas, "and", slashes, spaces).
_PORT_CLAUSE = re.compile(r"\bports?\b[\s:=]*((?:\d{1,5})(?:[\s,/&]+(?:and\s+)?\d{1,5})*)",
                          re.IGNORECASE)
# Tool names Reconix understands, mapped to how the scope names them.
TOOL_NAMES = {
    "nmap": "nmap", "masscan": "masscan", "nuclei": "Nuclei", "nikto": "Nikto",
    "zap": "OWASP ZAP", "owasp zap": "OWASP ZAP", "burp": "Burp Suite",
    "testssl": "testssl.sh", "testssl.sh": "testssl.sh", "sqlmap": "sqlmap",
    "gobuster": "gobuster", "ffuf": "ffuf", "httpx": "httpx", "wpscan": "wpscan",
    "nessus": "Nessus",
}
_TOOL_RE = re.compile(
    r"\b(" + "|".join(sorted((re.escape(name) for name in TOOL_NAMES), key=len, reverse=True))
    + r")\b", re.IGNORECASE)


def extract_ports(text: str) -> Tuple[int, ...]:
    """Ports named after a "port"/"ports" word, in order, de-duplicated (1–65535)."""
    out: list = []
    for clause in _PORT_CLAUSE.findall(text):
        for token in re.findall(r"\d{1,5}", clause):
            port = int(token)
            if 1 <= port <= 65535 and port not in out:
                out.append(port)
    return tuple(out)


def extract_tools(text: str) -> Tuple[str, ...]:
    """Tool names named anywhere in the line, canonicalized, in order, de-duplicated."""
    out: list = []
    for match in _TOOL_RE.findall(text):
        canonical = TOOL_NAMES[match.lower()]
        if canonical not in out:
            out.append(canonical)
    return tuple(out)


def parse_request(text: str) -> Optional[ParsedTarget]:
    """The target in `text` and the template it fits, or None when it names no target.

    When the line also says how to test it ("scan port 80 with nmap"), the ports and
    tools are read off and carried on the result, so the template can prefill the draft
    scope the operator then approves.
    """
    text = " ".join(text.split())
    found = _match_target(text)
    if found is None:
        return None
    return replace(found, ports=extract_ports(text), tools=extract_tools(text))


def _match_target(text: str) -> Optional[ParsedTarget]:
    """The target's shape → the template, with no intent attached (see `parse_request`)."""
    hint = keyword_hint(text)

    # Source: a git repo, or the source keyword (which then needs a repo URL or a path).
    if hint == "source" or targets.GIT_REF.search(text) or targets.GIT_URL.search(text):
        return targets.source_target(text)

    # A URL: a web app, an API when the path or a keyword says so, a host for "ports".
    url = targets.URL.search(text)
    if url:
        if hint == "network":
            return targets.network_target(text)
        api = hint == "api" or targets.looks_api(url.group(0))
        return targets.web_target(text, "api" if api else "web_url")

    # An IPv4 address or range: a network, unless a keyword says it serves an API or site.
    if targets.IPV4_LIKE.search(text):
        if hint in ("api", "web_url"):
            return targets.web_target(text, hint)
        return targets.network_target(text)

    # A bare hostname: the keyword decides; without one the operator picks the template.
    if targets.HOST.search(text):
        if hint == "network":
            return targets.network_target(text)
        if hint == "api":
            return targets.api_target(text)
        found = targets.web_target(text, "web_url")
        return replace(found, confident=hint == "web_url") if found else None

    # A lone local path.
    if targets.LOCAL_PATH.search(text):
        return targets.source_target(text)
    return None
