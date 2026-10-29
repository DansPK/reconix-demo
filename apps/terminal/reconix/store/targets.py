"""Is this a valid target for that template? Strict, per-template checks of typed input.

Two callers: `/template` (the operator chose the template, so the target must fit it) and
the free-text parser (it picks the template from the target's shape, then reads the value
here). Rule-based and offline: nothing here touches the network or the disk. A malformed
value (an IPv4 octet over 255, a range wider than /16, a URL without a host) raises
`StoreValidationError`; a text that holds no target of the kind returns None.
"""

import ipaddress
import re
from typing import Callable, Dict, Optional, Union
from urllib.parse import urlsplit

from ..models.parser import ParsedTarget
from .assessment import clean_request
from .errors import StoreValidationError

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
    return bool(API_PATH.search(urlsplit(url).path or ""))


def url_target(url: str, kind: str) -> ParsedTarget:
    """A web or API target from an http(s) URL. Credentials in the URL are dropped."""
    url = _clean(url)
    parts = urlsplit(url)
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
    parts = urlsplit(_clean(url))
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


# --- one finder per template ----------------------------------------------------------------
def network_target(text: str) -> Optional[ParsedTarget]:
    found = IPV4_LIKE.search(text)
    if found:
        value = ipv4(_clean(found.group(0)))
        label = "network range" if "/" in value else "network host"
        return ParsedTarget("network", value, value, label, "network", True)
    url = URL.search(text)
    host = urlsplit(_clean(url.group(0))).hostname if url else None
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
    found = finder(clean_request(text))
    if found is None:
        raise StoreValidationError(needs(template_id))
    return found


__all__ = [
    "URL", "GIT_URL", "GIT_REF", "HOST", "IPV4_LIKE", "LOCAL_PATH", "ipv4", "host_value",
    "looks_api", "url_target", "network_target", "web_target", "api_target", "source_target",
    "FINDERS", "needs", "check_target",
]
