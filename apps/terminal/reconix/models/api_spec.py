"""An OpenAPI / Swagger specification the operator attached to an API assessment.

Only a summary is kept (never the file): what the spec says about the API, as data.
"""

from dataclasses import dataclass, field
from typing import List, Optional, Tuple

MAX_ENDPOINTS = 500


@dataclass
class ApiSpec:
    title: str
    version: str
    spec_version: str                   # "3.0.3", "3.1.0" or "2.0"
    file_name: str
    servers: List[str] = field(default_factory=list)              # in scope (same host)
    out_of_scope_servers: List[str] = field(default_factory=list)  # listed, never added
    endpoints: List[Tuple[str, str]] = field(default_factory=list)  # (METHOD, /path), capped
    total: int = 0                      # every endpoint in the file (endpoints is capped)
    methods: List[str] = field(default_factory=list)
    security_schemes: List[str] = field(default_factory=list)
    base_methods: Optional[List[str]] = None   # the scope's methods before the first attach

    @property
    def label(self) -> str:
        """e.g. "Orders API 1.2.0" (the title, then the version when it has one)."""
        return f"{self.title} {self.version}".strip()


@dataclass
class ApiFormResult:
    """What saving the API template's form did (`store.save_api_form`)."""

    target_url: str                     # the draft scope's target after the save
    target_changed: bool = False        # the base URL re-drafted the scope
    spec: Optional[ApiSpec] = None      # the spec attached now (a copy), if any
    spec_attached: bool = False         # this save read a spec (attached or replaced)
    spec_dropped: str = ""              # a spec removed because the new target isn't its host
