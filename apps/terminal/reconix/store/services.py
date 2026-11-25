"""The services the header shows (Core API, Kali): scripted, static state. Nothing is probed."""

_API_ONLINE = True
_KALI = ("REACHABLE", "reconix-kali")


def api_online() -> bool:
    return _API_ONLINE


def kali_status() -> str:
    """"REACHABLE" | "UNREACHABLE" | "UNKNOWN", as the header's dot reads it."""
    return _KALI[0]


def kali_host() -> str:
    return _KALI[1]
