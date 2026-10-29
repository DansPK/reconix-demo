"""How a finding's fields look wherever they are shown (findings list, detail, report)."""

from typing import Dict

from rich.text import Text
from textual.widgets import Static

from .. import theme
from ..models import Finding
from ..store import SEVERITY_ORDER


def severity_text(finding: Finding) -> Text:
    """■ HIGH — the effective severity (an analyst override is marked with *)."""
    severity = finding.effective_severity
    mark = "*" if finding.severity_override else ""
    return Text(f"■ {severity}{mark}", style=f"bold {theme.SEVERITY.get(severity, theme.MUTED)}")


def validation_text(finding: Finding) -> Text:
    color, glyph = theme.STATUS.get(finding.validation, (theme.MUTED, "○"))
    return Text(f"{glyph} {finding.validation}", style=f"bold {color}")


def triage_text(finding: Finding) -> Text:
    color, label = theme.TRIAGE.get(finding.status, (theme.MUTED, finding.status))
    return Text(label, style=color)


def cvss_text(finding: Finding) -> str:
    return f"{finding.cvss_score:.1f}" if finding.cvss_score else "—"


def reference_text(finding: Finding) -> Text:
    """The most specific id: a CVE, else a CWE, else the first reference."""
    ref = (finding.cve or finding.cwe or finding.references or ["—"])[0]
    return Text(ref, style=theme.KEY)


def severity_strip(counts: Dict[str, int]) -> Text:
    """■ CRITICAL 0   ■ HIGH 1   ■ MEDIUM 1 …"""
    line = Text()
    for i, severity in enumerate(SEVERITY_ORDER):
        if i:
            line.append("   ")
        line.append(f"■ {severity} ", style=theme.SEVERITY[severity])
        line.append(str(counts.get(severity, 0)), style=f"bold {theme.TEXT}")
    return line


def severity_bars(counts: Dict[str, int], width: int = 28) -> Text:
    """One bar per severity, scaled to the largest count."""
    peak = max(counts.values(), default=0) or 1
    text = Text()
    for i, severity in enumerate(SEVERITY_ORDER):
        n = counts.get(severity, 0)
        filled = int(width * n / peak)
        if i:
            text.append("\n")
        text.append(f"{severity.title():<9}", style=theme.MUTED)
        text.append("█" * filled, style=theme.SEVERITY[severity])
        text.append("░" * (width - filled), style=theme.BORDER)
        text.append(f"  {n}", style=f"bold {theme.SEVERITY[severity]}")
    return text


class SeverityStrip(Static):
    """The one-line severity count strip above a findings table."""

    def show(self, counts: Dict[str, int]) -> None:
        self.update(severity_strip(counts))
