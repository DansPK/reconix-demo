"""How a finding's fields look wherever they are shown (findings list, detail, report)."""

import time
from dataclasses import replace
from typing import Any, Dict, Optional

from rich.text import Text
from textual.widgets import Static

from .. import theme
from ..models import Finding
from ..store import SEVERITY_ORDER
from ..store.redact import redact, redact_all, redact_lines
from . import motion


def mask(text: str) -> str:
    """Mask secrets in one string before it is shown (display only; store data is unchanged).

    The single seam used by the Findings list, the detail, the triage dialog subtitle and the
    chat draft, so a token, a credential URL or a password that rode into any finding field never
    reaches the screen, a dialog title or the model.
    """
    return redact(text or "")


def for_display(finding: Finding) -> Finding:
    """A copy of `finding` with every shown free-text field masked (display only).

    Ids, severities, validation, status, scores and vectors are untouched, so search, filter,
    sort and the cursor key still work on the real values; only the rendered text is masked.
    The store's data and the report export (which masks on its own) are never changed.
    """
    return replace(
        finding,
        title=mask(finding.title),
        path=mask(finding.path),
        affected_url=mask(finding.affected_url),
        description=mask(finding.description),
        impact=mask(finding.impact),
        remediation=mask(finding.remediation),
        category=mask(finding.category),
        references=redact_lines(list(finding.references)),
        evidence=redact_lines(list(finding.evidence)),
        triage_note=mask(finding.triage_note),
        classification_uncertainty=mask(finding.classification_uncertainty),
        validation_method=mask(finding.validation_method),
        validation_reason=mask(finding.validation_reason),
        validation_proof=redact_lines(list(finding.validation_proof)),
        source_claims=redact_lines(list(finding.source_claims)),
        effective_verification=redact_all(finding.effective_verification),
    )


def severity_text(finding: Finding) -> Text:
    """■ HIGH — the effective severity (an analyst override is marked with *)."""
    severity = finding.effective_severity
    mark = "*" if finding.severity_override else ""
    return Text(f"■ {severity}{mark}", style=f"bold {theme.SEVERITY.get(severity, theme.MUTED)}")


def validation_text(finding: Finding) -> Text:
    status = (finding.effective_verification or {}).get("status", "UNVERIFIED")
    verified = status == "VERIFIED" and bool(finding.validation_proof)
    label = status if status != "VERIFIED" or verified else "UNVERIFIED"
    if label == "UNVERIFIED" and finding.validation == "CONFIRMED":
        label = "UNVERIFIED (legacy, not verified)"
    return Text(f"{'✓' if verified else '○'} {label}",
                style=f"bold {theme.TEAL if verified else theme.MUTED}")


def triage_text(finding: Finding) -> Text:
    status = "false-positive" if finding.false_positive else finding.status
    color, label = theme.TRIAGE.get(status, (theme.MUTED, status))
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
    """The one-line severity count strip above a findings table.

    With motion on, the counts tick up from what was shown before (from 0 on arrival).
    """

    COUNT_SECONDS = 1.2

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._shown: Dict[str, int] = {}
        self._target: Dict[str, int] = {}
        self._start: Dict[str, int] = {}
        self._began = 0.0
        self._timer: Any = None

    def show(self, counts: Dict[str, int]) -> None:
        counts = dict(counts)
        if counts == self._target:
            return
        self._target = counts
        if not motion.motion_on(self.app) or not any(counts.values()):
            self._shown = counts
            self.update(severity_strip(counts))
            return
        self._start = dict(self._shown)
        self._began = time.monotonic()
        if self._timer is None:
            self._timer = self.set_interval(1 / 30, self._tick)
        self._tick()

    def _tick(self) -> None:
        t = min(1.0, (time.monotonic() - self._began) / self.COUNT_SECONDS)
        eased = 1 - (1 - t) ** 3
        self._shown = {
            key: round(self._start.get(key, 0) + (value - self._start.get(key, 0)) * eased)
            for key, value in self._target.items()
        }
        self.update(severity_strip(self._shown))
        if t >= 1.0 and self._timer is not None:
            self._timer.stop()
            self._timer = None


def _first_sentence(text: str, limit: int) -> str:
    """The text's first line, cut to `limit` cells with "…" (already masked by the caller)."""
    line = " ".join((text or "").split())
    if len(line) <= limit:
        return line
    return line[: limit - 1].rstrip() + "…"


def finding_preview(finding: Finding, width: int = 100) -> Text:
    """A few lines on the highlighted finding, under the findings table.

    `finding` must already be masked (`for_display`), like every shown field.
    """
    room = max(20, width - 14)
    out = Text()
    out.append_text(severity_text(finding))
    out.append("  ")
    out.append(finding.title, style=f"bold {theme.TEXT}")
    where = finding.affected_url or finding.path
    meta = Text.assemble(
        ("\n", ""),
        ("found by ", theme.DIM),
        (finding.tool or "—", theme.TEAL),
    )
    if where:
        meta.append("  ·  ", style=theme.DIM)
        meta.append(_first_sentence(where, max(20, width - meta.cell_len)), style=theme.MUTED)
    out.append_text(meta)
    rows = (
        ("What", finding.description),
        ("Impact", finding.impact),
        ("Fix", finding.remediation),
    )
    for label, value in rows:
        if value and value.strip():
            out.append(f"\n{label:<8}", style=theme.DIM)
            out.append(_first_sentence(value, room), style=theme.TEXT)
    out.append("\n")
    out.append("↵ ", style=f"bold {theme.TEXT}")
    out.append("open the full finding · evidence, validation and triage", style=theme.DIM)
    return out


class FindingPreview(Static):
    """The highlighted finding's summary under the findings table (masked)."""

    def show(self, finding: Optional[Finding]) -> None:
        if finding is None:
            self.update("")
            return
        shown = for_display(finding)
        if shown.fid != getattr(self, "_fid", None):
            self._fid = shown.fid
            motion.fade_in(self, duration=0.3)
        self.border_title = Text(f"Finding {shown.fid}", style=f"bold {theme.TEXT}")
        self.update(finding_preview(shown, self.size.width or 100))
