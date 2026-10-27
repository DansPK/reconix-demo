from .base import BaseScanner
from .commix import CommixScanner
from .gobuster import GobusterScanner
from .httpprobe import HttpProbeScanner
from .nikto import NiktoScanner
from .nmap import NmapScanner
from .nuclei import NucleiScanner
from .sqlmap import SqlmapScanner
from .upload import UploadScanner
from .whatweb import WhatWebScanner
from .zap import ZapScanner

SCANNERS: dict[str, type[BaseScanner]] = {
    "nmap": NmapScanner,
    "nuclei": NucleiScanner,
    # nuclei in DAST mode (active param fuzzing + OAST): SSRF, LFI, injections.
    # Same MCP tool as "nuclei"; differs only by its configured `-dast` options.
    "nuclei-dast": NucleiScanner,
    "sqlmap": SqlmapScanner,
    "nikto": NiktoScanner,
    "commix": CommixScanner,
    "whatweb": WhatWebScanner,
    "gobuster": GobusterScanner,
    "zap": ZapScanner,
    "upload": UploadScanner,
    # host-side authenticated HTTP probe: confirms IDOR/BOLA, carries auth intact
    # (bypasses the MCP server's whitespace-split of options).
    "httpprobe": HttpProbeScanner,
}

__all__ = [
    "BaseScanner",
    "NmapScanner",
    "NucleiScanner",
    "SqlmapScanner",
    "NiktoScanner",
    "CommixScanner",
    "WhatWebScanner",
    "GobusterScanner",
    "ZapScanner",
    "UploadScanner",
    "HttpProbeScanner",
    "SCANNERS",
]
