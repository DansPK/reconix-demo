"""Request-target normalization for the policy check.

A target is accepted only when it can be reduced to one canonical path on the
approved host. Anything ambiguous (encoded separators, double encoding, `//`,
whitespace, another host or port) is refused rather than guessed at.
"""

import ipaddress
import posixpath
import re
from typing import Optional, Tuple
from urllib.parse import unquote, urlsplit

DEFAULT_PORTS = {"http": 80, "https": 443}


class TargetError(ValueError):
    """The request target is outside the scope or can't be read safely."""


def _port(scheme: str, port: Optional[int]) -> Optional[int]:
    return port if port is not None else DEFAULT_PORTS.get(scheme)


def canonical_path(target: str, base_url: str) -> str:
    """The lower-cased, normalized path `target` would hit on `base_url`'s host.

    Raises TargetError for another host, scheme or port, and for any target that
    could be read in more than one way.
    """
    if not target or any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in target):
        raise TargetError("Malformed request target")
    try:
        parts = urlsplit(target)
        base = urlsplit(base_url)
        port, base_port = parts.port, base.port
    except ValueError:
        raise TargetError("Malformed request target") from None
    if parts.scheme or parts.netloc:
        same_host = (parts.scheme.lower() == base.scheme.lower()
                     and (parts.hostname or "") == (base.hostname or "")
                     and _port(parts.scheme.lower(), port) == _port(base.scheme.lower(), base_port))
        if not same_host or parts.username or parts.password:
            raise TargetError("Host outside approved scope")
    path = parts.path or ("/" if parts.netloc else "")
    if not path.startswith("/") or path.startswith("//"):
        raise TargetError("Malformed request target")
    path = "/".join(seg.split(";", 1)[0] for seg in path.split("/"))   # drop matrix params
    lowered = path.lower()
    if "%2f" in lowered or "%5c" in lowered:
        raise TargetError("Encoded path separators are not allowed")
    decoded = unquote(path)
    if "%" in decoded or "\\" in decoded:
        raise TargetError("Malformed request target")
    if any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in decoded):
        raise TargetError("Malformed request target")   # encoded control char
    normalized = posixpath.normpath(decoded)
    if normalized.startswith("//"):
        raise TargetError("Malformed request target")
    return normalized.casefold()


def is_under(path: str, prefix: str) -> bool:
    """True when the canonical `path` is `prefix` or below it."""
    root = posixpath.normpath(prefix).casefold().rstrip("/") or "/"
    return root == "/" or path == root or path.startswith(root + "/")


# --- network and source targets (scope kinds other than HTTP) ----------------------------
# A network request target is one host, optionally with a port: "192.0.2.10", "10.0.0.7:443",
# "scanme.example.com:22". Excluded entries may also be a range ("10.0.0.0/28") and may name
# a port. Ports are plain ASCII digits; anything else (spaces, "+22", "2_2", a range used
# as a host) is malformed, so the text checked is the text that would run.
_HOST_PORT = re.compile(r"(?P<host>[A-Za-z0-9.-]+)(?::(?P<port>[0-9]{1,5}))?", re.ASCII)
_EXCLUDED = re.compile(r"(?P<host>[A-Za-z0-9.-]+(?:/[0-9]{1,2})?)(?::(?P<port>[0-9]{1,5}))?",
                       re.ASCII)


def _split(pattern, text: str) -> Optional[Tuple[str, Optional[int]]]:
    """(host, port or None) when `text` is a well-formed entry, else None."""
    found = pattern.fullmatch(text.strip())
    if not found:
        return None
    port = int(found["port"]) if found["port"] else None
    if port is not None and not 1 <= port <= 65535:
        return None
    return found["host"], port


def network_entry(text: str) -> Optional[Tuple[str, Optional[int]]]:
    """An excluded network entry as (host or range, port or None); None if malformed."""
    entry = _split(_EXCLUDED, text)
    if entry is None:
        return None
    host = entry[0]
    if "/" in host:
        try:
            ipaddress.ip_network(host, strict=False)
        except ValueError:
            return None
    return entry


def host_port_reason(target: str, scope_target: str, allowed_ports: list, excluded: list) -> str:
    """"" when a network target (host or host:port) is in scope, else why it is blocked.

    A target with no port (host discovery) only needs its host in scope.
    """
    parsed = _split(_HOST_PORT, target)
    if parsed is None:
        return "Malformed target"
    host, port = parsed
    if any(_excluded(entry, host, port) for entry in excluded):
        return "Host or port outside approved scope"
    if not _host_in_scope(host, scope_target):
        return "Host outside approved scope"
    if port is not None and allowed_ports and port not in allowed_ports:
        return f"Port {port} not in the approved list"
    return ""


def _excluded(entry: str, host: str, port: Optional[int]) -> bool:
    """True when the excluded `entry` covers this host (and port, if the entry names one)."""
    parsed = network_entry(entry)
    if parsed is None:
        return entry.strip().casefold() == host.casefold()   # unreadable: exact text only
    spec, entry_port = parsed
    if entry_port is not None and entry_port != port:
        return False
    return _host_in_scope(host, spec)


def _host_in_scope(host: str, scope_target: str) -> bool:
    """True when `host` (an address or hostname, never a range) is or is inside the target."""
    host = host.strip()
    base = scope_target.strip()
    if not host or "/" in host:
        return False
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return "/" not in base and host.casefold() == base.casefold()   # a hostname: exact
    try:
        if "/" in base:
            return address in ipaddress.ip_network(base, strict=False)
        return address == ipaddress.ip_address(base)
    except ValueError:
        return False


def repo_path_reason(target: str, excluded: list) -> str:
    """"" when a repo-relative path is in scope, else why it is blocked.

    The text is what a tool would open, so it must stay in the repository as written: no
    "..", no "~" or drive/URL colon, no backslash. Normalizing "../../etc/passwd" to
    "/etc/passwd" would judge a path that isn't the one that runs.
    """
    if (".." in target.replace("\\", "/").split("/") or ":" in target or "\\" in target
            or target.strip().startswith("~")):
        return "Path leaves the repository"
    try:
        path = canonical_path("/" + target.lstrip("/"), "file://repo")
    except TargetError as exc:
        return str(exc)
    if any(is_under(path, "/" + e.strip().lstrip("/")) for e in excluded):
        return "Path excluded from the review"
    return ""


# --- one decision for every kind of scope ------------------------------------------------
def request_reason(scope, method: Optional[str], target: str) -> str:
    """"" when `target` may be reached under `scope`, else the reason it is blocked.

    The one implementation of the scope rules, used by the policy engine (`scope._decide`)
    and by the agent guard. By kind: HTTP method (when `method` is given), canonical path,
    host and excluded paths for web_url and api; host-and-port for network (a URL's default
    port is made explicit so the port list applies); a repo-relative path for source.
    Status and time limit are the caller's: this judges the target only.
    """
    if scope.kind == "network":
        text = target.strip()
        if "://" in text:
            try:
                parts = urlsplit(text)
                port = parts.port or DEFAULT_PORTS.get(parts.scheme.lower())
            except ValueError:
                return "Malformed request target"
            if not parts.hostname or parts.username or parts.password:
                return "Malformed request target"
            text = f"{parts.hostname}:{port}" if port else parts.hostname
        return host_port_reason(text, scope.target_url, scope.allowed_ports,
                                scope.excluded_paths)
    if scope.kind == "source":
        return repo_path_reason(target, scope.excluded_paths)
    if method is not None and method not in scope.allowed_methods:
        return f"Method {method} not allowed"
    try:
        path = canonical_path(target, scope.target_url)
    except TargetError as exc:
        return str(exc)
    if any(is_under(path, excluded) for excluded in scope.excluded_paths):
        return "Path outside approved scope"
    return ""
