"""Reconix design tokens — the single source of truth for colors.

Rich markup in widgets uses the constants below. The stylesheets in `styles/` use
the same values as `$variables`: `ReconixApp.get_css_variables()` feeds them
`CSS_TOKENS`, so a color is defined here and nowhere else.
"""

from typing import Dict

from rich.text import Text

# Core palette (matches reconix_tokens.json from the Figma pack)
BG          = "#0B0F12"
SURFACE     = "#131A1F"
SURFACE2    = "#0F1519"
RAISED      = "#18222A"
BORDER      = "#1F2A30"
BORDER_STR  = "#2B3A42"
TEXT        = "#E6EDF0"
MUTED       = "#7D8B91"
DIM         = "#4A575D"

CYAN        = "#22D3EE"
CYAN_DIM    = "#0C6D88"
TEAL        = "#2DD4BF"

# Severity scale
CRITICAL    = "#F2495C"
HIGH        = "#F97316"
MEDIUM      = "#FBBF24"
LOW         = "#38BDF8"
INFO        = "#94A3B8"
# The web's CRITICAL: the same red, lifted a little so a badge's text (the colour at 13 % over a
# row's surface, status-badge.tsx) reads at 4.5:1 there too; the scale and its meaning stay.
CRITICAL_WEB = "#F56A7A"

# Syntax / accents
VIOLET      = "#A78BFA"
GREEN       = "#4ADE80"
STRING      = "#86EFAC"
KEY         = "#7DD3FC"
NUMBER      = "#FDBA74"

# Tinted backgrounds for chips, banners and highlighted rows
CYAN_BG     = "#0E2A33"
AMBER_BG    = "#2B2410"
GREEN_BG    = "#0D2A20"
RED_BG      = "#2D1418"
VIOLET_BG   = "#1E1A33"

# $name -> value for the stylesheets (see ReconixApp.get_css_variables)
CSS_TOKENS: Dict[str, str] = {
    "bg": BG, "surface": SURFACE, "surface2": SURFACE2, "raised": RAISED,
    "border": BORDER, "border-strong": BORDER_STR,
    "text": TEXT, "muted": MUTED, "dim": DIM,
    "cyan": CYAN, "cyan-dim": CYAN_DIM, "teal": TEAL,
    "critical": CRITICAL, "high": HIGH, "medium": MEDIUM, "low": LOW, "info": INFO,
    "violet": VIOLET, "green": GREEN,
    "cyan-bg": CYAN_BG, "amber-bg": AMBER_BG, "green-bg": GREEN_BG, "red-bg": RED_BG,
    "violet-bg": VIOLET_BG,
}

# Web dashboard (web/) — the dark Security-Operations-Center console from the reconix-web-ui
# site (globe dashboard). Teal `primary` for active states, chart fills and rings; amber
# `accent` for approval gates / MEDIUM; green `success` for pass / LOW; red `danger` for
# CRITICAL / HIGH; `page` is the backdrop behind the near-black app frame (`background`).
# Dark only. scripts/export_tokens.py writes them to web/src/styles/tokens.css; the web code
# uses only those variables. The browser terminal uses the TUI's own colors.
WEB_TOKENS: Dict[str, Dict[str, str]] = {
    "dark": {
        "page": "#071417", "page-glow": "#0F6B74", "background": "#03090B",
        "foreground": "#F5FAFA", "card": "#0D181B", "card-2": "#091214",
        "card-foreground": "#F5FAFA", "surface": "#142327", "muted": "#101C20",
        "muted-foreground": "#A7BCC0", "border": "#2B4048",
        "primary": "#00F5D4", "primary-strong": "#86FFF3", "primary-dim": "#00C9B0",
        "primary-foreground": "#032A27", "accent": "#FFB020", "success": "#00FF9D",
        "danger": "#FF3B5C", "ring": "#00F5D4", "globe-dot": "#00E5FF", "globe-glow": CYAN,
        # meanings (web/src/lib/status.ts): amber `warning` = waiting / needs review, blue
        # `info` = informational. Full-chroma electric hues for maximum pop on the near-black
        # frame; the TUI keeps its own SEVERITY scale below (globe-glow stays the TUI's cyan).
        "warning": "#FFB020", "info": "#4DABFF",
        "sev-critical": "#FF2E63", "sev-high": "#FF7A00", "sev-medium": "#FFC400", "sev-low": "#00B3FF",
    },
}

SEVERITY = {
    "CRITICAL": CRITICAL,
    "HIGH": HIGH,
    "MEDIUM": MEDIUM,
    "LOW": LOW,
    "NONE": INFO,       # informational (an open port): the Core API's NONE
    "UNKNOWN": MUTED,   # a result the tool couldn't rate
}

# Risk of a gated action (plan rows, approval panel)
RISK = {
    "LOW": GREEN,
    "MEDIUM": MEDIUM,
    "HIGH": CRITICAL,
}

# (color, glyph) for a finding's validation and a plan task's state
STATUS = {
    "CONFIRMED":    (TEAL,   "✓"),
    "UNCONFIRMED":  (MUTED,  "○"),
    "INCONCLUSIVE": (VIOLET, "◐"),
    "done":         (GREEN,  "✓"),
    "active":       (CYAN,   "◌"),
    "pending":      (DIM,    "·"),
    "skipped":      (CRITICAL, "✕"),   # a step whose every gated check you rejected
}

# (color, label) for an analyst's triage status. The labels are the store's TRIAGE_LABELS
# words, so the list, the report and the triage dialog say the same thing.
TRIAGE = {
    "open":           (MUTED,    "Open"),
    "fixed":          (GREEN,    "Fixed"),
    "accepted":       (MEDIUM,   "Accepted risk"),
    "false-positive": (VIOLET,   "False positive"),
}

# Text color for a tone ("ok", "warn", "block", ...) used by chat, log and dialogs
TONE = {
    "default": TEXT,
    "ok": GREEN,
    "warn": MEDIUM,
    "block": CRITICAL,
    "muted": MUTED,
}

# Chip colors: tone -> (text, background)
CHIP = {
    "cyan":   (CYAN, CYAN_BG),
    "amber":  (MEDIUM, AMBER_BG),
    "green":  (GREEN, GREEN_BG),
    "red":    (CRITICAL, RED_BG),
    "violet": (VIOLET, VIOLET_BG),
    "muted":  (MUTED, RAISED),
}

# Who said it: chat speakers and activity-log sources
SPEAKER = {"reconix": CYAN, "you": VIOLET, "policy": MEDIUM}
SOURCE = {"SYS": TEXT, "AI": CYAN, "USER": VIOLET, "TOOL": TEAL, "POLICY": MEDIUM}

SEVERITY_CHIP = {
    "CRITICAL": "red", "HIGH": "red", "MEDIUM": "amber", "LOW": "cyan",
    "NONE": "muted", "UNKNOWN": "muted",
}
RISK_CHIP = {"LOW": "green", "MEDIUM": "amber", "HIGH": "red"}


def chip(label: str, tone: str = "cyan", solid: bool = False) -> Text:
    """A small label on a tinted background, e.g. ` DRAFT `. `solid` inverts it."""
    fg, bg = CHIP.get(tone, CHIP["muted"])
    style = f"bold {BG} on {fg}" if solid else f"bold {fg} on {bg}"
    return Text(f" {label} ", style=style)


def severity_chip(severity: str) -> Text:
    severity = severity.upper()
    return chip(severity, SEVERITY_CHIP.get(severity, "muted"))


def risk_chip(risk: str) -> Text:
    risk = risk.upper()
    return chip(f"RISK: {risk}", RISK_CHIP.get(risk, "muted"), solid=True)
