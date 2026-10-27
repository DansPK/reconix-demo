# Web dashboard: tidy overview, paged lists, terminal controls

Follow-up to `WEB_THEME_ABOUT_PLAN.md`. Same design system (tokens, cards, wells); no new
colors.

## Decisions (agreed with the owner)

- **Needs attention** shows the items that fit next to the five recent assessments, one
  of each kind first (waiting, review, stopped, interrupted), then the rest. Its header
  gets **View all (N)**, which opens Assessments with a new **Needs attention** status
  filter (waiting, stopped and interrupted runs). Both cards share the row's height.
- **Findings by severity** fills the row next to Findings per day: bars, the
  confirmed/review meter, then a small breakdown table (Severity, Findings, Confirmed,
  For review). Findings per day's chart grows to the row's height, so neither card leaves
  a gap in Chart or Table view.
- **Pagination**: Previous / Next arrow buttons and an "11–20 of 34" count, 10 rows a page,
  in the URL (`?page=` on Assessments and Findings; `?blocked=` and `?decisions=` on Policy,
  so the two tables page on their own). Hidden when everything fits on one page. Changing
  a filter goes back to page 1; an out-of-range page shows the last one.
- **Terminal controls** (icon buttons in the session card's header, with tooltips):
  - **Expand / Restore**: the terminal fills the browser window (not browser fullscreen,
    so Esc still reaches the TUI). The page behind it doesn't scroll.
  - **Copy output**: the selection if there is one, else everything in the terminal (for
    the full-screen TUI, its screen).
  - **Clear**: wipes the screen and has the TUI redraw it: a same-size resize message (the
    helper always signals SIGWINCH, and the TUI then repaints every row — checked); the
    session and its run go on. After a session ends it just clears the leftover text.
  - **Restart session**: asks first while a session is live ("Keep this session" is the
    first choice), restarts straight away otherwise.
  - **↓ Latest**: a small button over the terminal, only while the view isn't at the
    bottom of its scrollback.

## Code

- `lib/pagination.ts`: `pageNumber(param)`, `paginate(items, page, size)` (pure, tested).
- `components/neu/pager.tsx`: the one pager every list uses (`nav`, labelled links,
  disabled ends). Server component; takes an `hrefFor(page)`.
- `lib/data/stats.ts`: `ATTENTION` status filter; `attentionItems()` orders the list.
- `playwright.config.ts`: the test server writes its sign-in link to a temp file, not
  `~/.reconix/web.url` (a running dashboard's link).
- `components/overview/needs-attention.tsx`: takes a `limit`, says how many more there are.
- `components/charts/severity-table.tsx`: the breakdown table; `per-day-chart.tsx` grows.
- `components/terminal/`: `terminal-toolbar.tsx` (buttons), `restart-button.tsx`
  (confirm menu), `scroll-to-latest.tsx`, `use-terminal-view.ts` (at-bottom tracking,
  copy, clear); `use-terminal-session.ts` exposes `redraw()`. `Button` gets `quiet` and
  `icon-sm`.
  `lib/terminal/screen-text.ts`: screen lines → copyable text (pure, tested).

## Tests

- vitest: `paginate` / `pageNumber`, the attention filter and order, `screenText`.
- e2e: findings and approvals page through 10 at a time; Needs attention links to its
  filter; terminal Expand / Restore, Copy, Clear, Restart (with the confirm), ↓ Latest.
- lint, typecheck, build, e2e; screenshots desktop + phone, both themes.
