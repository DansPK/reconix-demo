"""Is this a valid target for that template? Strict, per-template checks of typed input.

Two callers: `/template` (the operator chose the template, so the target must fit it) and
the free-text parser (it picks the template from the target's shape, then reads the value
here). Rule-based and offline: nothing here touches the network (`require_folder`, for the
Template field, is the only one that reads the disk). A malformed
value (an IPv4 octet over 255, a range wider than /16, a URL without a host) raises
`StoreValidationError`; a text that holds no target of the kind returns None.
"""

import ipaddress
import os
import re
from dataclasses import dataclass
from typing import Callable, Dict, Optional, Union
from urllib.parse import SplitResult, urlsplit

from ..models.parser import ParsedTarget
from .assessment import MAX_REQUEST_LENGTH, clean_request
from .errors import StoreValidationError
from .redact import redact

# --- what a target looks like inside a sentence -------------------------------------------
URL = re.compile(r"\bhttps?://[^\s'\"<>]+", re.IGNORECASE)
GIT_URL = re.compile(r"\b(?:ssh|git)://[^\s'\"<>]+", re.IGNORECASE)
GIT_REF = re.compile(r"\b(?:git@[^\s'\"<>]+|(?:github\.com|gitlab\.com|bitbucket\.org)/"
                     r"[^\s'\"<>]+)", re.IGNORECASE)
HOST = re.compile(r"\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b", re.IGNORECASE)
# Loose on purpose: 10.0.0.300 is found here and then refused by ipv4(), not ignored.
IPV4_LIKE = re.compile(r"(?<![\w.])\d+(?:\.\d+){3}(?:/\d+)?(?!\w|\.\d)")
LOCAL_PATH = re.compile(r"(?:^|\s)((?:~|\.{1,2})?/[^\s'\"<>]+|[A-Za-z]:\\[^\s'\"<>]+)")
API_PATH = re.compile(r"/(?:api|v\d+|graphql|rest)\b", re.IGNORECASE)

_HOSTNAME = re.compile(r"^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
                       r"(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$", re.IGNORECASE)
_TRAILING = ".,;:!?)]}'\""

WIDEST_RANGE = 16   # /16 = 65,536 addresses; anything wider is refused


def _clean(token: str) -> str:
    return token.rstrip(_TRAILING)


def _shown(text: str) -> str:
    """The typed value, shortened to fit a one-line message."""
    return text if len(text) <= 40 else text[:39] + "…"


def _split(url: str) -> SplitResult:
    """`urlsplit`, refusing what it can't read ("http://x]x[" reads as a broken IPv6 literal)
    as a store error: typed text must never crash the app."""
    try:
        return urlsplit(url)
    except ValueError:
        raise StoreValidationError(f"{redact(_shown(url))} isn't a valid URL.") from None


# --- single values -------------------------------------------------------------------------
def as_network(text: str) -> Optional[Union[ipaddress.IPv4Network, ipaddress.IPv6Network]]:
    """`text` as an address range (a single address is a /32), or None for anything else."""
    try:
        return ipaddress.ip_network(text.strip(), strict=False)
    except ValueError:
        return None


def ipv4(token: str) -> str:
    """A normalized IPv4 address or range ("10.0.0.5/24" -> "10.0.0.0/24"); raises if invalid."""
    if "/" in token:
        try:
            network = ipaddress.IPv4Network(token, strict=False)
        except ValueError:
            raise StoreValidationError(
                f"{token} isn't a valid IPv4 range — e.g. 10.0.0.0/24") from None
        if network.prefixlen < WIDEST_RANGE:
            raise StoreValidationError(
                f"{token} is too wide to test — use a /{WIDEST_RANGE} or smaller range.")
        _usable(network.network_address, token)
        return str(network) if network.prefixlen < 32 else str(network.network_address)
    try:
        address = ipaddress.IPv4Address(token)
    except ValueError:
        raise StoreValidationError(
            f"{token} isn't a valid IPv4 address — four numbers from 0 to 255.") from None
    _usable(address, token)
    return str(address)


def _usable(address: ipaddress.IPv4Address, token: str) -> None:
    if address.is_unspecified or address.is_multicast or address.is_reserved:
        raise StoreValidationError(f"{token} isn't an address that can be tested.")


def host_value(host: str) -> str:
    """A lower-case hostname or a normalized IPv4 address; raises if it is neither."""
    host = host.strip().rstrip(".").lower()
    if IPV4_LIKE.fullmatch(host):
        return ipv4(host)
    if _HOSTNAME.match(host):
        return host
    raise StoreValidationError(f"{host or 'That'} isn't a valid host name.")


def looks_api(url: str) -> bool:
    return bool(API_PATH.search(_split(url).path or ""))


def url_target(url: str, kind: str) -> ParsedTarget:
    """A web or API target from an http(s) URL. Credentials in the URL are dropped."""
    url = _clean(url)
    parts = _split(url)
    if not parts.hostname:
        raise StoreValidationError(f"{url} has no host name.")
    try:
        port = parts.port
    except ValueError:
        raise StoreValidationError(f"{url} has an invalid port.") from None
    host = parts.hostname if ":" in parts.hostname else host_value(parts.hostname)
    shown = f"[{host}]" if ":" in host else host          # IPv6 literals keep their brackets
    base = f"{parts.scheme.lower()}://{shown}" + (f":{port}" if port else "")   # never user:pass@
    label = "API service" if kind == "api" else "web application"
    return ParsedTarget(kind, host, base, label, kind, confident=True)


def _repo_url(url: str, min_segments: int) -> Optional[str]:
    """A repository URL without credentials, query or fragment; None if it isn't one."""
    parts = _split(_clean(url))
    segments = [s for s in parts.path.split("/") if s]
    if not parts.hostname:
        return None
    if len(segments) < min_segments and not parts.path.endswith(".git"):
        return None
    try:
        port = f":{parts.port}" if parts.port else ""
    except ValueError:
        return None
    return f"{parts.scheme.lower()}://{parts.hostname}{port}/{'/'.join(segments)}"


def _git_ref(ref: str) -> str:
    """owner/repo on a known git host, or git@host:path; raises when the repo is missing."""
    ref = _clean(ref).rstrip("/")
    if ref.lower().startswith("git@"):
        _, _, path = ref.partition(":")
        if path.strip("/"):
            return ref
    elif len([s for s in ref.split("/") if s]) >= 3:          # host/owner/repo
        return ref
    raise StoreValidationError(f"{ref} isn't a repository — e.g. github.com/acme/app")


DASH_RANGE_UNSUPPORTED = (
    "Dash ranges aren't supported by the scope yet — use CIDR, e.g. 10.0.0.0/27.")
# A range written with a dash (also spaced, en/em dash), "..", or "to" between two addresses.
_ANY_RANGE = re.compile(
    r"\d+(?:\.\d+){3}\s*(?:-|\u2013|\u2014|\.\.|\bto\b)\s*(?:\d+(?:\.\d+){3}|\d+)\b",
    re.IGNORECASE)


def _refuse_dash_range(text: str) -> None:
    """The scope takes one address or a CIDR range: reading only the first address of a dash
    range would test less than was typed."""
    if _ANY_RANGE.search(text):
        raise StoreValidationError(DASH_RANGE_UNSUPPORTED)


# --- one finder per template ----------------------------------------------------------------
def network_target(text: str) -> Optional[ParsedTarget]:
    _refuse_dash_range(text)
    found = IPV4_LIKE.search(text)
    if found:
        value = ipv4(_clean(found.group(0)))
        label = "network range" if "/" in value else "network host"
        return ParsedTarget("network", value, value, label, "network", True)
    url = URL.search(text)
    host = _split(_clean(url.group(0))).hostname if url else None
    if not host:
        bare = HOST.search(text)
        host = bare.group(0) if bare else None
    if host:
        value = host_value(host)
        return ParsedTarget("network", value, value, "network host", "network", True)
    return None


def web_target(text: str, kind: str = "web_url") -> Optional[ParsedTarget]:
    url = URL.search(text)
    if url:
        return url_target(url.group(0), kind)
    _refuse_dash_range(text)
    found = IPV4_LIKE.search(text)
    if found and "/" not in found.group(0):                # a range is not a site
        return url_target(f"https://{ipv4(_clean(found.group(0)))}", kind)
    bare = HOST.search(text)
    if bare:
        return url_target(f"https://{host_value(bare.group(0))}", kind)
    return None


def api_target(text: str) -> Optional[ParsedTarget]:
    return web_target(text, "api")


def source_target(text: str) -> Optional[ParsedTarget]:
    ref = GIT_REF.search(text)
    if ref:
        return _source(_git_ref(ref.group(0)))
    for pattern, min_segments in ((GIT_URL, 1), (URL, 2)):   # https needs owner/repo or .git
        found = pattern.search(text)
        repo = _repo_url(found.group(0), min_segments) if found else None
        if repo:
            return _source(repo)
    path = LOCAL_PATH.search(text)
    if path:
        return _source(_clean(path.group(1)).rstrip("/") or "/")
    return None


def _source(ref: str) -> ParsedTarget:
    return ParsedTarget("source", ref, ref, "source repository", "source", True)


FINDERS: Dict[str, Callable[[str], Optional[ParsedTarget]]] = {
    "network": network_target, "web_url": web_target, "api": api_target,
    "source": source_target,
}


# --- the store function -----------------------------------------------------------------------
def needs(template_id: str) -> str:
    """What a template's target must be, as one sentence with an example."""
    from .templates import MODULES      # (imported here: this module stays a leaf)

    spec = MODULES[template_id].SPEC
    return f"{spec.name} needs {spec.target_hint} — e.g. {spec.example}"


def check_target(template_id: str, text: str) -> ParsedTarget:
    """The target in `text`, validated for `template_id`; raises with what to type instead."""
    finder = FINDERS.get(template_id)
    if finder is None:
        raise StoreValidationError(f"Unknown template {template_id}.")
    if not text.strip():
        raise StoreValidationError(needs(template_id))
    text = clean_request(text)
    found = finder(text) or _single_label(template_id, text)
    if found is None:
        raise StoreValidationError(needs(template_id))
    return found


def _single_label(template_id: str, text: str) -> Optional[ParsedTarget]:
    """A one-word host name (a lab service such as "juice-shop"), taken only when you picked
    the template and typed it first. Free text never reads a lone word as a target."""
    words = text.split()
    first = _clean(words[0]) if words else ""
    if not first or not _HOSTNAME.match(first) or not any(c.isalpha() for c in first):
        return None
    # The whole line is the name ("metasploitable"), or the name looks like one (a dash or a
    # digit: "juice-shop port 3000"), so "my servers" or "the usual one" are not hosts.
    if len(words) > 1 and not any(c == "-" or c.isdigit() for c in first):
        return None
    if template_id == "network":
        value = host_value(first)
        return ParsedTarget("network", value, value, "network host", "network", True)
    if template_id in ("web_url", "api"):
        return url_target(f"http://{host_value(first)}", template_id)
    return None


# --- the template's target field, checked as you type ----------------------------------------
@dataclass(frozen=True)
class FieldCheck:
    """A value typed in a template's target field, read as you type it.

    `level` is "ok", "caution" (it will be used, but it is easy to get wrong: a one-word host
    name) or "error"; `message` says why, in one line; `target` is set unless it is an error.
    """

    level: str
    message: str
    target: Optional[ParsedTarget] = None


_SCHEME = re.compile(r"^([a-z][a-z0-9+.-]*):", re.IGNORECASE)


def max_length(template_id: str) -> int:
    """The longest target the template's field takes: a hostname is at most 253 characters,
    and no target is longer than the request line that carries it."""
    return 253 if template_id == "network" else MAX_REQUEST_LENGTH


def check_field(template_id: str, text: str) -> FieldCheck:
    """The template field's verdict on `text`, the whole value, not a request line.

    `check_target` reads a request ("10.0.0.1 please scan" gives 10.0.0.1); a field holds one
    value, so anything around it is an error here, not silently dropped. Format and a local
    folder's existence only: the scope check decides later.
    """
    value = text.strip()
    if not value:
        return FieldCheck("error", needs(template_id))
    limit = max_length(template_id)
    if len(value) > limit:
        return FieldCheck(
            "error", f"Too long: {len(value)} characters — at most {limit} for this template.")
    if any(ch.isspace() for ch in value):
        return FieldCheck("error", "A target is one value, without spaces.")
    scheme = _SCHEME.match(value)
    if template_id in ("web_url", "api") and scheme and "://" in value:
        if scheme.group(1).lower() not in ("http", "https"):
            return FieldCheck(
                "error", f"{scheme.group(1)}:// isn't supported — use http:// or https://.")
    try:
        target = check_target(template_id, value)
        require_folder(target)
    except StoreValidationError as exc:
        return FieldCheck("error", str(exc))
    if template_id != "source" and target.target.lower() not in value.lower():
        # the parser picked something out of the value: say what, never use it silently
        return FieldCheck("error", f"Only {_shown(target.target)} reads as a target here.")
    if template_id != "source" and "." not in target.target and ":" not in target.target:
        return FieldCheck(
            "caution", f"one-word host name {_shown(target.target)} — fine for a lab host; "
            "check it is yours to test", target)
    return FieldCheck("ok", f"{target.target_kind}: {_shown(target.target)}", target)


def require_folder(target: ParsedTarget) -> None:
    """A local source target must be an existing folder (a repository ref passes)."""
    ref = target.target
    if target.kind != "source" or not LOCAL_PATH.fullmatch(ref):
        return
    path = os.path.expanduser(ref)
    if not os.path.exists(path):
        raise StoreValidationError(
            f"{_shown(ref)} doesn't exist — type a folder that does, e.g. ~/code/app")
    if not os.path.isdir(path):
        raise StoreValidationError(
            f"{_shown(ref)} is a file — type its folder instead, e.g. ~/code/app")


__all__ = [
    "URL", "GIT_URL", "GIT_REF", "HOST", "IPV4_LIKE", "LOCAL_PATH", "ipv4", "host_value",
    "looks_api", "url_target", "network_target", "web_target", "api_target", "source_target",
    "FINDERS", "needs", "check_target", "FieldCheck", "max_length", "check_field",
    "require_folder", "DASH_RANGE_UNSUPPORTED",
]
