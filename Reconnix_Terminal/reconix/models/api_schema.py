"""The schema digest built from an attached OpenAPI / Swagger file, for the AI.

This is the *structure* of the API as data: per endpoint, its method and path, a short
summary, its parameters, its request body's content types and top-level fields, its response
codes and the names of its security schemes. Every string is already redacted and cleaned
when the digest is built (`store/openapi.py`).

The digest is kept in memory on the assessment only. It is never saved to disk, never put in
the snapshot the web reads, and never put in a report. It is handed to the `/assess` agent and
the TUI chat as fenced, untrusted reference data; it never widens the approved scope.
"""

from dataclasses import dataclass, field
from typing import List


@dataclass
class ApiParam:
    """One operation parameter."""

    name: str
    location: str       # "path", "query", "header" or "cookie"
    type: str           # the schema type, e.g. "string" ("" when unknown)
    required: bool


@dataclass
class ApiBodyField:
    """One top-level field of a request body schema."""

    name: str
    type: str
    required: bool


@dataclass
class ApiEndpoint:
    """One method + path, with its short summary and shape."""

    method: str
    path: str
    summary: str = ""                                   # ≤ ~200 chars, redacted
    params: List[ApiParam] = field(default_factory=list)
    body_types: List[str] = field(default_factory=list)
    body_fields: List[ApiBodyField] = field(default_factory=list)
    responses: List[str] = field(default_factory=list)  # status codes, e.g. "200"
    security: List[str] = field(default_factory=list)   # security scheme names


@dataclass
class ApiSchemaDigest:
    """The kept endpoints (capped by count and total size) and whether anything was cut."""

    endpoints: List[ApiEndpoint] = field(default_factory=list)
    total: int = 0              # every operation in the file (endpoints may be capped)
    truncated: bool = False     # True when the count or the size cap dropped endpoints
