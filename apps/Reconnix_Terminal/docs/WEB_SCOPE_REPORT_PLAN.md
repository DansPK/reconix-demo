# Plan — Scope and Report views in the Overview's style

Status: building (2026-10-20). Decisions from the owner: **match the Overview** (full width, a
summary strip, panels side by side), **an overall summary when no run is picked** (instead of
the long run picker), and **no policy tiles** on the Report (as on the Overview).

## What each view shows

Every number comes from the saved runs (derive modules, no I/O, nothing invented); colour is
never the only signal (badges from `lib/status.ts`).

| View | One run (`?uid=`) | All runs (default) |
|------|-------------------|--------------------|
| Scope strip | In scope · Excluded · Approvals (by state) · Time window (used of the limit) | Targets · Scopes approved · Approvals · Within the time window |
| Scope panels | Boundary (target, ports, exclusions) · Approval requests · Permitted actions and tools · Limits | Targets (runs, ports, scope state, latest run) · Approval requests across runs (waiting first) · Actions and tools with run counts · Limits with run counts |
| Report strip | Findings · Plan steps · Requests sent · Masked evidence | Runs · Findings · Requests sent · Masked evidence |
| Report panels | Assessment (details, plan steps) · Findings by Severity · Findings table (opens the finding) · downloads in the header | Findings by Severity · Targets · Runs table with search and downloads (a row opens that run's report) |

"Policy checks allowed" and "Blocked by policy" leave the Report; the verdicts stay in the
saved files, the TUI and the downloaded reports.

## Code

- `components/dashboard/stat-card.tsx`: the strip's card, big number and meter, shared by the
  Overview's `SummaryStrip` and the new `StatStrip` (no `data-motion`: only the Overview moves).
- `derive-scope.ts` / `derive-report.ts` → `ScopeCards` / `ReportCards` (`scope-types.ts`,
  `report-types.ts`), one shape per view for either mode, like `OverviewCards`. `Dashboard` and
  `Overall` carry them; `page.tsx` hands them to `ScopeView` / `ReportsView`.
- Panels, one per file: `scope-boundary`, `scope-targets`, `approval-list`, `chip-panel`,
  `scope-limits`, `report-details`, `report-findings`, `report-runs`, `report-targets`.
- `FindingsCard` takes an `id` (every view stays mounted, so ids must differ).
- `RunPicker` goes (the switcher in the top bar still picks any run).

## Checks

vitest for the derivations (counts trace to the files; pending approvals first; no policy
tiles), e2e (pages, a11y: axe on both modes of both views, scroll), the real-data browser pass.
