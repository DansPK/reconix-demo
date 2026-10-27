"""Attach AI explanations/remediation to findings."""

from __future__ import annotations

from ..models import Finding
from .client import LLMClient
from .prompts import VULN_ANALYSIS, format_finding


class Analyzer:
    def __init__(self, llm: LLMClient):
        self.llm = llm

    @property
    def available(self) -> bool:
        return self.llm.available

    async def analyze(self, finding: Finding) -> str | None:
        """Return an AI analysis string, or None if the LLM is unavailable/failed."""
        if not self.llm.available:
            return None
        user = format_finding(
            title=finding.title,
            severity=finding.severity.value,
            location=finding.location,
            evidence=finding.evidence,
        )
        try:
            return await self.llm.complete(VULN_ANALYSIS, user)
        except Exception as exc:  # noqa: BLE001 - never let LLM errors break a scan
            return f"[analysis unavailable: {exc}]"
