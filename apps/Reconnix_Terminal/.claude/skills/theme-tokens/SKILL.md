---
name: theme-tokens
description: Rules for adding or changing colors and design tokens in the Reconix TUI while keeping reconix/theme.py and reconix/reconix.tcss in sync with the Figma palette. Use whenever touching colors, severity/status/risk styles, or badges.
---

# Theme tokens

The palette comes from the Figma pack (`reconix_tokens.json`) and lives in two places:

| Where | Used for | Naming |
|-------|----------|--------|
| `reconix/theme.py` | Rich markup inside widgets (`f"[{theme.CYAN}]…[/]"`) | `UPPER_SNAKE` constants |
| `reconix/reconix.tcss` | Textual widget styling | `$kebab-case` variables |

## Rules
1. **Never hard-code a hex value** in a screen or widget. Use a token.
2. **Add every new color to both files** with the same value, for example
   `BORDER_STR = "#2B3A42"` and `$border-strong: #2B3A42;`.
3. Severity, status, and risk colors go through the maps (`SEVERITY`, `STATUS`,
   `RISK`) and helpers (`severity_badge`, `status_badge`, `risk_badge`). Add a
   new status to `STATUS` with a `(color, glyph)` pair instead of styling it inline.
4. The severity scale order is fixed: CRITICAL, HIGH, MEDIUM, LOW, INFO. Do not reuse
   severity colors for non-severity meaning (use `CYAN`/`TEAL` accents instead).
5. Keep contrast readable on `BG #0B0F12`: body text uses `TEXT`, secondary uses
   `MUTED`, and hints use `DIM`. Do not use `DIM` for anything the user must read.

## Sync check
Run this to list hex values that differ between the two files:

```bash
diff <(grep -oE '#[0-9A-Fa-f]{6}' reconix/theme.py | tr a-f A-F | sort -u) \
     <(grep -oE '#[0-9A-Fa-f]{6}' reconix/reconix.tcss | tr a-f A-F | sort -u)
```

Expected differences today: `GREEN`, `KEY`, `STRING`, `NUMBER`, `VIOLET`, and
`INFO` exist only in `theme.py` because TCSS does not use them, and `#0E2A33`
(a selection highlight) exists only in TCSS. Any new color used in both places
must match, and a TCSS-only literal should become a `$token`.

Find hard-coded hex values in screens and widgets:

```bash
grep -rnE '#[0-9A-Fa-f]{6}' reconix/screens reconix/widgets
```

Known existing debt: `screens/scope.py` (JSON punctuation) uses literal hex.
Replace it with `theme.*` when you touch that file. New code must add no new hits. Data in `reconix/store/` holds no markup
or colors; screens apply `theme.*` when rendering.
