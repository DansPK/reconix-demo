# Plan — the web dashboard gets the globe UI (from reconix-web-ui)

2026-10-20. Status: **built** (phases 1 and 2).

## Why

The owner opens the dashboard with `/web` and wants it to look like the
`reconix-web-ui` site: the "Assessment Operations Center" with the globe, timelines and the
Findings / Audit log / Reports / Scope views. It must show the real saved assessments and
run the real TUI in a Terminal view (owner's choices, 2026-10-20).

## What changes

Only the UI layer of `web/` is replaced; its data, sign-in, terminal and export plumbing
stay, so every rule in CLAUDE.md's "Web dashboard" section still holds.

| Kept as is | Replaced |
|---|---|
| `lib/auth/*` (viewer for every page, operator for the terminal), `src/proxy.ts`, nonce CSP | `app/(dash)/*`: Dashboard, AI Assistant (mock), Assessments, Findings, About, Settings |
| `lib/data/{schema,store,stats,export}.ts`, `lib/report/*`, both `/api/assessments/*` routes | `components/*` (neu, charts, layout, …), `lib/{format,references,pagination}.ts` |
| `lib/terminal/*`, the terminal session hooks, `scripts/serve.mjs`, `sample-data/` | `app/layout.tsx`, `globals.css`, the login page's look |
| vitest tests for the kept modules, e2e access tests | e2e page tests (rewritten for the new views) |

New, from reconix-web-ui (the version already adapted to live data on 2026-10-20):

- `/` is the viewer: Overview (globe), Findings, Audit log, Reports, Scope, **Terminal**
  (`?view=`; `/terminal` redirects there). The Terminal view is mounted on first visit and
  kept, so the TUI keeps running while you browse and during the 10 s live refresh.
- `lib/data/adapt.ts` + `components/dashboard/derive.ts`: one saved assessment → every number
  on the page. Nothing the snapshot doesn't record is shown (no hosts, iterations, AI
  confidence).
- `/docs/**`: the site's documentation (the cards' ↗ links point there). Pages render per
  request behind the viewer check, so they get the nonce CSP like every other page.
- Reports view links the existing export route (PDF, HTML, JSON, CSV, SARIF; since
  2026-10-21 PDF, JSON and DOCX only, see `WEB_REDESIGN_V3_PLAN.md` §5.2).
- Colours: the globe palette goes into `theme.WEB_TOKENS` (dark only) and
  `scripts/export_tokens.py` writes `tokens.css`; `globals.css` has no colour literals.
- After `/web` signs in, the browser lands on the Overview.

Dropped with the old UI: the light theme, the Settings page, the AI Assistant mock and the
paged Assessments / Findings lists (the Assessment switcher in the top bar replaces the list).

## Verify

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run e2e`;
`pytest -q`; start through `/web`'s launcher on spare ports and walk every view in a browser
on sample data and real data, including typing into the Terminal view.

## Phase 2 — bugs, data that breaks the UI, features (owner's request, same day)

**Bugs first.** Generate edge-case saved files (no scope / no findings / no timeline; 60
findings with long titles and unbroken URLs; 400 log lines; lines without times or all in
one second; INFO-only and false-positive findings; Khmer and emoji text; 60 saved runs; a
corrupt file) and walk every view at 1600×1000, 1280×800 and 390×844, failing on console
errors and horizontal overflow. Known: the Overview's bottom row is cut off at 1000 px
height; the Ask bar suggests web-scan questions for every template; skipped files are only
mentioned when nothing else loads.

**Features** (patterns from security and audit-log UIs: search plus combinable filters,
charts that drill into a filtered list, filter by event type and actor, a "what to act on"
list):

1. **Findings:** search (title, ID, CWE, target), severity and validation chips with counts,
   one-click clear; the filters live in the address (`?sev=&val=&q=`).
2. **Drill-down:** the Overview's severity tiles, Findings and Blocked-by-policy stats and
   top-finding rows open the matching filtered view.
3. **Audit log:** kind and actor chips with counts, search, the actor on each line.
4. **Assessment switcher:** a search box over every saved run.
5. **Needs you:** the bell lists every saved run that waits on a decision, not only this one.
6. **Skipped files** are reported in the switcher whenever any file was skipped.

All filtering is client-side over data the page already has (no new routes, still
read-only); every count still comes from the derived data.

### Phase 2 results

Fixed: the Overview's bottom row (the execution chart's aspect ratio stretched the row past its
track), the timeline's edge labels, long references and audit lines spilling out of their
cards, a favicon 404, no switcher on phones, the hero title over the globe on phones, the Ask
bar's fixed web-scan questions (now from the run) and its text under the mic icon, unreadable
execution lanes on long runs (same-tool steps merge; at most 28 marks), a one-second axis on
empty runs, minutes over the limit not marked, skipped files hidden when other runs load, and
the finding detail out of sight on phones. The six features above are built, with unit tests
(`tests/filters.test.ts`, `tests/dashboard.test.ts`) and e2e tests (`e2e/pages.spec.ts`).

## Phase 3 — the Overview totals every saved run (owner's request)

The owner wants the Overview's cards to show the overall data, not one assessment.

**Selection.** No `?uid=` (or an unknown one) means **All assessments**, the new default;
`?uid=<uid>` opens one run as before. The switcher lists "All assessments" first.

**Overview cards in All mode** (`components/dashboard/derive-overall.ts`, pure, over every
`AssessmentView`; the time axis runs from the first saved run to the last):

| Card | All assessments |
|------|-----------------|
| Activity Timeline | runs started over time (bar height = runs in that slot; red = found high/critical, amber = waits on you); peaks = runs with findings |
| Ask bar | scopes approved across runs, targets, questions about every run |
| Stat cards | findings, policy checks, blocked, assessments (completed / waiting) |
| Execution Timeline | one mark per run on the same axis (colour by status); rings: runs completed, plan steps done |
| Assessment Progress | share of runs completed |
| Tool Activity | tool steps over time, all runs (requests sent in total) |
| Findings by Severity | every run's findings; top CVSS across runs |

The cards stop reading the whole `Dashboard`: each takes its own slice (`OverviewCards`), which
both `deriveDashboard` (one run) and `deriveOverall` (all runs) produce, so one set of card
components draws both.

**Other views in All mode.** Findings lists every run's findings (each row names its run and
links to it; a finding's key is `<uid>~<id>`). Audit log, Reports and Scope belong to one run:
they show a run picker. The top bar's Target / Template / Status chips show counts across
runs; the bell lists every waiting run.

Still read-only, no new routes; tests: `tests/dashboard.test.ts` (overall sums agree with the
files), `e2e/pages.spec.ts` (default is All, a run still opens with `?uid=`).

### Phase 3 results

Built as planned. On the owner's 27 saved runs the Overview shows 27 assessments, 30
findings (14 high), 62 policy checks, 18 blocked, 26 % completed, 73 tool steps, every run on
the execution axis (3 Oct → 9 Oct) and the top CVSS findings with their runs. Findings lists all
30 with their runs; Audit log, Reports and Scope show the run picker. Unit tests for the totals
(`deriveOverall` in `tests/dashboard.test.ts`) and e2e tests for the new default pass.
