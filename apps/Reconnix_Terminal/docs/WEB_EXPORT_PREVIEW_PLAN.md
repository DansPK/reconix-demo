# Web: export menu + preview before download

> **Superseded (2026-10-21).** Reports are now saved as PDF, JSON and DOCX only, in the TUI
> and the web alike; the HTML report is the PDF's source and the combined preview, never a
> download, and the CSV, SARIF and Markdown writers are gone. See
> `WEB_REDESIGN_V3_PLAN.md` §5.2. The plan below is kept as the record of that round.

**Ask (2026-10-06):** on the assessment page the five export buttons (PDF, Report, JSON,
CSV, SARIF) should be one dropdown, and every format should show a preview before it is
downloaded.

## Flow

1. Assessment page header → **Export ▾** (shadcn `DropdownMenu`, Radix) lists the five
   formats. Each item is a link.
2. `/assessments/[uid]/export?format=<id>` — the **preview page**: a format switcher
   (links, like every other filter), the file facts (name, type, size), the preview, and the
   **Download** button (plus **Open in new tab** for the PDF and HTML report).
3. Download = the existing API route (`/api/assessments/[uid]/export?format=<id>`), which
   now also serves `json` and, with `inline=1`, the PDF for the preview `<iframe>`.

## Previews

| Format | Preview | Source |
|---|---|---|
| pdf   | `<iframe>` on the PDF route (`inline=1#toolbar=0`), or a notice when no Chrome | `lib/report/pdf.ts` |
| html  | `<iframe>` on the HTML route (already inline, no scripts) | `lib/report/html.ts` |
| csv   | a real table from the same rows the file is built from, raw text underneath | `csvRows()` |
| json  | pretty JSON in a scrollable code block | the parsed assessment |
| sarif | pretty JSON in a scrollable code block | `toSarif()` |

## Files

- `web/src/lib/report/formats.ts` — the one list of formats (id, label, ext, media type,
  blurb, preview kind) + href/filename helpers. Client-safe; the menu, page and route all use it.
- `web/src/lib/report/render.ts` — server-only `renderText(format, assessment)`.
- `web/src/lib/auth/csp.ts` — the CSP builder (moved out of `proxy.ts`): `frame-ancestors
  'self'` **only** for the export route, so the preview page may frame it; `'none'` elsewhere.
- `web/src/components/ui/dropdown-menu.tsx` — shadcn DropdownMenu, soft-UI themed.
- `web/src/components/assessments/export-menu.tsx` — the Export ▾ button (client).
- `web/src/components/exports/` — `frame-preview`, `csv-preview`, `code-preview`,
  `export-preview` (picks one).
- `web/src/app/(dash)/assessments/[uid]/export/page.tsx` — the preview page.
- `web/src/app/api/assessments/[uid]/export/route.ts` — reads `formats.ts`; `json`, `inline`.
- Tests: `tests/formats.test.ts`, `tests/csp.test.ts`, `csvRows` in `tests/export.test.ts`.

## Rules kept

Read-only; viewer role on the page (layout/proxy) and on the route; saved text is never
rendered as HTML (the report escapes every value, the CSV table is React text); colors only
from tokens; the PDF iframe is same-origin and the route still refuses other hosts.
