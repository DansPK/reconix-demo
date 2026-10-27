# Overview data: stale runs, analyst triage, more saved data (web only)

## Context

The dashboard overview (`web/src/app/(dash)/page.tsx`) reads the JSON files the TUI saves
(`~/.reconix/assessments`, via `loadLibrary()`), and all its numbers come from pure helpers
in `web/src/lib/data/stats.ts`. Three problems:

1. **Stale "waiting" runs.** `close_session()` runs only on a clean TUI quit
   (`reconix/app.py:77`). A killed TUI (web Terminal restart, closed window) leaves its file
   at "Awaiting input" forever: 9 of the 25 local files, 1–3 days old, all listed as
   "waits for you".
2. **Triage is ignored.** Counts use the detected `severity`, and "for review" looks only at
   `validation`. The analyst's override (`effective_severity`) and status (fixed / accepted /
   false-positive) never count.
3. **Saved data is missing from the overview:** a live run's phase and progress, CVSS,
   finding category, testing time.

Decisions (from the user): web only (no snapshot/schema change); stale after **12 h**; the
overview's risk views count **open findings only**, at the analyst's severity; add a
**Live now** card, a **CVSS** tile, **Findings by category** and **average testing time**;
the Findings page uses the same rules so its links and counts match.

Note: all local findings are still `open` with no overrides, so the triage changes show only
after triage is used in the TUI.

## Step 0: docs (project rule 6)

Save this plan as `docs/OVERVIEW_DATA_PLAN.md`.

## 1. Data rules: `web/src/lib/data/stats.ts` (pure, unit-tested)

New helpers:
- `effectiveSeverity(f)`: `f.effective_severity || f.severity_override`, used only if it is
  one of `SEVERITIES` (older files default to `""`), else `f.severity`.
- `isFalsePositive(f)`, `isOpen(f)`: open unless the status is fixed / accepted /
  false-positive, so unknown future statuses still count as open.
- `needsReview(f) = isOpen(f) && !isConfirmed(f)`.
- `triageCounts(findings)` → `{ open, fixed, accepted, falsePositive }`.
- `markIdle(a, now, afterMs)`: if the status is unfinished (New / Running / Awaiting input),
  `!session_closed`, `afterMs > 0` and `now - Date.parse(saved_at) > afterMs`, return a copy
  marked `Interrupted` with `waiting_gate`, `waiting_request_id` and `waiting_for` cleared
  (same as the `session_closed` transform in `schema.ts`). An unparseable `saved_at` stays
  as is.
- `idleInterrupted(a) = a.status === "Interrupted" && !a.session_closed`, for the wording.
- `isLive(a)`: Running or Awaiting input.
- `averageTestingMs(list)`: mean of `durationMs()` over Completed runs (`null` if none).

Changed (same signatures):
- `severityCounts` and the `allFindings` sort → `effectiveSeverity`.
- `perDay`, `byTemplate` → leave out false positives.
- `attentionItems` → the review item counts `needsReview`.
- `overview()` adds fields and keeps the existing ones (the Policy page uses it):
  - `findings` → excludes false positives
  - new: `open`, `fixed`, `accepted`, `falsePositive`, `review` (= `needsReview`)
  - new: `cvss` (= `cvssSummary` of open findings), `avgTestingMs`
  - `byStatus` already includes Interrupted

## 2. Apply the stale rule in one place: `web/src/lib/data/store.ts`

- `staleAfterMs()` reads `RECONIX_STALE_AFTER_HOURS` (default 12; `0` turns it off; invalid →
  default), next to `dataDir()`.
- `loadLibrary()` maps every assessment through `markIdle(a, Date.now(), staleAfterMs())`.
  Every page then agrees: the sidebar, the Assessments status filter, detail pages, exports.
- `web/playwright.config.ts` sets `RECONIX_STALE_AFTER_HOURS: "0"`, because the sample data
  is static and old.
- Document the variable in `web/README.md`, next to `RECONIX_DATA_DIR`. Also check the About
  page's `components/about/content.ts` for an env/data-path list.

## 3. Reusable components

- `components/neu/kpi.tsx`: `KpiGrid` gets `cols?: 5 | 6` (default 5, `xl:grid-cols-6`
  for 6), so the Policy and detail pages stay as they are.
- `components/charts/hbars.tsx`: optional `max` (fixed scale) and `unit` (e.g. `"%"`), so
  progress bars reuse HBars.
- `components/charts/severity-bars.tsx`, `severity-table.tsx`: use `effectiveSeverity` and
  `needsReview` ("For review" = open and unconfirmed).
- New `components/overview/live-runs.tsx` (`LiveRuns`): for up to 3 live runs:
  - label (link to the detail page), `StatusChip`, target and template
  - phase and "N requests"
  - `HBars` over `run.progress` (discovery → report, `max={100}`, `unit="%"`)
  - for a waiting run: "Waits for: \<waiting_for\>. Decide it in the terminal app."
  - "and N more" when there are more

  Text is rendered as React text only.

## 4. Overview page: `web/src/app/(dash)/page.tsx`

- `const open = findings.filter(isOpen)`; the risk views use `open`.
- KPI row (`<KpiGrid cols={6}>`):
  1. **Assessments**: the existing status notes, plus "● N interrupted" (faint), plus
     "avg 4m 12s testing" from `formatDuration(avgTestingMs)` when there is one.
  2. **Findings**: value = all but false positives. Notes: ● N open, ● N fixed,
     ● N accepted, ● N false positives left out (each only when > 0, open always shown).
     Confirmed / for review stays in the severity card's meter.
  3. **Highest CVSS** (new): `max.toFixed(1)` or "—". Notes: "avg X.X · N scored", or
     "no open finding scored".
  4–6. Blocked by policy, Approvals granted, Requests sent: unchanged.
- **Live now** card (full width, under the KPIs), shown only while a run is live. The page
  stays the same when idle; when something runs, it is the first card you see.
- **Findings by severity**: `open` findings, hint "open findings".
- **Findings per day**, **Recent assessments**, **Needs attention**: same cards with the new
  rules. The waiting / review / interrupted counts follow automatically.
- Bottom row, 3 cards (`xl:grid-cols-3`, `md:grid-cols-2`):
  - **Top weakness categories** (`open`)
  - **Findings by category** (new: `categoryCounts(open)`, hint "open findings")
  - **Findings by template**

## 5. Matching wording and the Findings page

- `components/overview/needs-attention.tsx` and
  `components/assessments/detail-header.tsx`, Interrupted wording:
  - `idleInterrupted(a)`: "No activity since \<formatShort(saved_at)\>; the terminal app
    probably closed."
  - otherwise: keep the current text.
- `web/src/app/(dash)/findings/page.tsx`:
  - the severity filter and its `present` set use `effectiveSeverity`
  - `val=review` uses `needsReview`; `confirmed` stays `isConfirmed`
- `components/findings/findings-table.tsx` and `finding-detail.tsx`: the chip shows
  `effectiveSeverity`. When overridden, add "detected HIGH" (cell-sub) / a "Detected
  severity" row.
- Out of scope, unchanged: report/export files (`lib/report/*`, `lib/data/export.ts`) and the
  sidebar's findings count.

## 6. Tests

- `web/tests/stats.test.ts`: build variants by cloning sample findings or assessments.
  - `markIdle`: just under / over 12 h, `session_closed` is untouched, Completed and Stopped
    are untouched, bad `saved_at`, `afterMs = 0` is off. It also clears the waiting fields,
    so `waitingApproval()` is null.
  - `effectiveSeverity`: override wins; `""` or an invalid value falls back.
  - triage:
    - `triageCounts`
    - `needsReview` excludes triaged findings
    - `overview()`: false positives left out, CVSS on open findings only
    - `perDay` / `byTemplate` leave false positives out
    - `attentionItems` review count
  - `averageTestingMs`: Completed only; `null` when there are none.
- `web/tests/store.test.ts`: `staleAfterMs()` parses the env (default, 0, invalid).
  `loadLibrary` marks an old waiting file Interrupted (temp dir).
- `web/e2e/pages.spec.ts`:
  - assert the "Highest CVSS" tile, the "Findings by category" heading, and the "Live now"
    card for the sample's waiting run (the stale rule is off in e2e)
  - the existing tile assertions still hold (no false positives in the sample)

## Verification

```bash
cd web
npm test                                  # vitest: stats + store
npx next typegen && npm run lint && npm run typecheck
npm run build && npm run e2e              # Playwright on sample-data
npm run dev                               # real data in ~/.reconix/assessments
```

Manual checks in the browser:
- The 9 stale runs show as Interrupted ("No activity since …"). Needs attention no longer
  says "waits for you" for them, and its View all count matches /assessments?status=attention.
- Start `python -m reconix` and begin an assessment. Within 10 s the Live now card appears
  and its progress bars move.
- In the TUI, triage a finding as false-positive and another as fixed. Within 10 s:
  - the Findings tile notes change
  - the severity, CVSS and category views drop them
  - the "need review" link count equals the Findings page's "For review" count

Then run the `code-reviewer` subagent on the diff.
