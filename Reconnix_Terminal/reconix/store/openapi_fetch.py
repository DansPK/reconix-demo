"""Downloading an OpenAPI spec from the API's own host: one read, nothing else.

A spec URL is accepted only on the draft target's host, over https (http only for localhost,
127.0.0.1 and ::1), with no user name or password in it. The download is one GET with no
redirects (a 3xx is an error), no proxy, no cookies, a 10 s limit and a hard 5 MB cap read in
chunks. The audit log gets the host and path, never the query. What comes back goes through
the same parse / summarize / redact pipeline as a file (`store/openapi.py`), whose `$ref`
resolution is local only, so nothing in the spec is ever fetched.
"""

import http.client
import re
import socket
import ssl
import time
import urllib.error
import urllib.request
from typing import Tuple
from urllib.parse import SplitResult, urlsplit, urlunsplit

from .activity import log_event
from .errors import StoreValidationError
from .redact import redact

FETCH_TIMEOUT = 10.0                # seconds for the whole download (tests shorten it)
MAX_FETCH_BYTES = 5 * 1024 * 1024
CHUNK = 64 * 1024
LOCAL_HOSTS = ("localhost", "127.0.0.1", "::1")
ACCEPT = "application/json, application/yaml, text/yaml, text/plain;q=0.5"
_SCHEME = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*://")


def is_spec_url(text: str) -> bool:
    """True when the spec field holds a URL (`scheme://…`) rather than a file path."""
    return bool(_SCHEME.match((text or "").strip()))


def _host(url: str) -> str:
    try:
        return (urlsplit(url).hostname or "").casefold()
    except ValueError:
        return ""


def check_spec_url(text: str, target_url: str) -> SplitResult:
    """The spec URL, checked against the draft target; raises StoreValidationError."""
    text = (text or "").strip()
    if any(ch.isspace() or ord(ch) < 32 or ord(ch) == 127 for ch in text):
        raise StoreValidationError("Couldn't download the spec: the URL isn't valid.")
    try:
        parts = urlsplit(text)
        host = (parts.hostname or "").casefold()
        parts.port                                        # noqa: B018 - raises on a bad port
    except ValueError:
        raise StoreValidationError("Couldn't download the spec: the URL isn't valid.") from None
    if "@" in parts.netloc:
        raise StoreValidationError("The spec URL can't include a user name or password.")
    target_host = _host(target_url)
    if not host or host != target_host:
        raise StoreValidationError(f"The spec URL must be on {target_host}.")
    scheme = parts.scheme.casefold()
    if scheme != "https" and not (scheme == "http" and host in LOCAL_HOSTS):
        raise StoreValidationError("The spec URL must use https.")
    return parts


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """A 3xx is not followed: urllib then raises it as an HTTPError."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D401
        return None


def _opener() -> urllib.request.OpenerDirector:
    return urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect())


def _failed(reason: str) -> StoreValidationError:
    return StoreValidationError(f"Couldn't download the spec: {reason}.")


def _too_slow() -> StoreValidationError:
    return _failed(f"no answer within {FETCH_TIMEOUT:g} s")


def _read_capped(response, deadline: float) -> bytes:
    length = response.headers.get("Content-Length")
    if length and length.strip().isdigit() and int(length) > MAX_FETCH_BYTES:
        raise _failed("it is over 5 MB")
    chunks = []
    size = 0
    while True:
        chunk = response.read(CHUNK)
        if not chunk:
            break
        size += len(chunk)
        if size > MAX_FETCH_BYTES:
            raise _failed("it is over 5 MB")
        chunks.append(chunk)
        if time.monotonic() > deadline:
            raise _too_slow()
    return b"".join(chunks)


def fetch_spec(text: str, target_url: str) -> Tuple[str, str, bool]:
    """Download the spec at `text`: (a display name, the text, read as JSON?).

    Raises StoreValidationError: the URL is refused, the download fails, it redirects, it is
    too large or too slow, or it is not UTF-8 text.
    """
    parts = check_spec_url(text, target_url)
    url = urlunsplit((parts.scheme.lower(), parts.netloc, parts.path or "/", parts.query, ""))
    request = urllib.request.Request(url, method="GET", headers={
        "Accept": ACCEPT, "User-Agent": "Reconix-spec-reader"})
    deadline = time.monotonic() + FETCH_TIMEOUT
    try:
        with _opener().open(request, timeout=FETCH_TIMEOUT) as response:
            raw = _read_capped(response, deadline)
            content_type = (response.headers.get("Content-Type") or "").lower()
    except StoreValidationError:
        raise
    except urllib.error.HTTPError as exc:
        if 300 <= exc.code < 400:
            raise _failed(f"the server redirected it (HTTP {exc.code})") from None
        raise _failed(f"the server answered HTTP {exc.code}") from None
    except urllib.error.URLError as exc:
        if isinstance(exc.reason, (socket.timeout, TimeoutError)):
            raise _too_slow() from None
        if isinstance(exc.reason, ssl.SSLError):
            raise _failed("the TLS connection failed") from None
        raise _failed("the connection failed") from None
    except (socket.timeout, TimeoutError):
        raise _too_slow() from None
    except ssl.SSLError:
        raise _failed("the TLS connection failed") from None
    except (http.client.HTTPException, OSError, ValueError):
        raise _failed("the connection failed") from None
    host = (parts.hostname or "").casefold()
    shown = f"[{host}]" if ":" in host else host
    path = parts.path or "/"
    log_event("api_spec.fetched", redact(f"{shown}{path}"))     # never the query
    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise _failed("it isn't UTF-8 text") from None
    lower = path.lower()
    if lower.endswith((".yaml", ".yml")):
        is_json = False
    else:
        is_json = lower.endswith(".json") or "json" in content_type
    return f"{shown}{path}", content, is_json


__all__ = ["FETCH_TIMEOUT", "MAX_FETCH_BYTES", "is_spec_url", "check_spec_url", "fetch_spec"]
