# Plan — local web dashboard for analysis (read-only)

2026-10-05. Follows `DASHBOARD_PLAN.md`, `REAL_USE_PLAN.md` and `PLAN_LIST_PLAN.md`.

> **2026-10-07:** the read-only rule now has one exception, the **Terminal** page, which
> runs the TUI itself in the browser. See `WEB_TERMINAL_PLAN.md`.

## Decisions (from the user)

- **The run stays in the TUI.** Templates, scope, target login, approvals and reports are
  still decided in the terminal app. The web dashboard **only analyses what was done**:
  it is read-only, with no buttons that change an assessment.
- **Data:** the TUI **auto-saves** each assessment to `~/.reconix/assessments/*.json` as
  it changes. Passwords, cookies and one-time codes are never saved. The web reads that
  folder. This replaces "memory only" for the TUI.
- **Style:** neumorphism (soft UI), in **light and dark with a toggle**. It follows the
  system setting by default; brand and severity hues come from `reconix/theme.py`.
- **Runtime:** **Next.js only.** Server pages read the folder directly, with no Python API.
- **Access:** bound to `127.0.0.1`, with a launch token and a single read-only **viewer**
  role.
- **TUI kept** as is; the web is a second, separate app.

Mockup (clickable, both themes): https://claude.ai/artifact/3sswuwCKQUGpS7E1uDQ2wp.
Images: `docs/design/web/*-light.png` and `*-dark.png`.

```
python -m reconix (TUI) ── store ── autosave ──▶ ~/.reconix/assessments/<session>_<id>.json
                                                         │  (no secrets, schema v1)
                     npm start (Next.js, 127.0.0.1:3100) ◀┘  read + zod-validate → pages
```

## 1. TUI side: save each assessment (Python, no new libraries)

| File | Change |
|---|---|
| `reconix/store/snapshot.py` (new) | `snapshot(assessment) -> dict`: plain JSON, `"schema": "reconix.assessment/v1"` |
| `reconix/store/persist.py` (new) | `DATA_DIR` (`RECONIX_DATA_DIR`, default `~/.reconix/assessments`), `autosave()`: write only if the content changed, atomically (tmp + `os.replace`), folder 0700 / file 0600, `RECONIX_SAVE=0` turns it off |
| `reconix/store/lists.py` | `SESSION_ID` (start time, `20261005-140311`) so files from different sessions never collide (every session restarts at `RCX-DEMO-001`) |
| `reconix/store/__init__.py` | export `autosave` |
| `reconix/screens/dashboard.py` | call `store.autosave()` in `refresh_view()` and on unmount (the store decides whether anything changed) |
| `tests/conftest.py` | point `DATA_DIR` at `tmp_path` |

**The snapshot contains:** `uid` (file stem), session id, label, target and kind,
template, operator, status (`New`, `Running`, `Awaiting input`, `Completed`, `Stopped`)
plus the waiting gate or the stop reason, created, started and finished times, time
limit, request count, phase progress, plan tasks, scope manifest, policy verdicts,
approval requests (risk, action, target, purpose, impact, hash) and decisions (decision,
operator, reason, time), **revealed** findings (evidence is already masked), timeline
(chat and activity entries with `seq`), the operator's requests, report path, and
`auth_kind` plus `authenticated` (true/false).

**Never in it:** vault entries (`Secret`, and also the login identity), confirmation
tokens, one-time codes. A test fills a known password and code, runs a whole assessment,
and checks that neither string appears in any saved file.

## 2. Web side: `web/` (Next.js 16, App Router, TypeScript strict)

| Library | Why |
|---|---|
| `next`, `react`, `react-dom` | the app; server components read the data folder |
| `tailwindcss` v4 + `@tailwindcss/postcss` | styling; neumorphism tokens as CSS variables |
| `next-themes` | light / dark / system toggle with no flash |
| `zod` | validate every saved file; a bad file is skipped and listed, never crashes a page |
| `recharts` | charts (severity bars, findings per day, categories, templates) |
| `@tanstack/react-table` | sortable, filterable assessments and findings tables |
| Radix primitives (shadcn style, written in this repo) | tabs, select, toggle group, tooltip, scroll area |
| `lucide-react` | icons |
| `class-variance-authority`, `clsx`, `tailwind-merge` | component variants + `cn()` |
| `server-only` | keeps the file reader out of browser bundles |
| dev: `vitest`, `@testing-library/react`, `jsdom`, `@playwright/test`, `eslint` + `eslint-config-next` | tests and lint |

```
web/
├── scripts/start.mjs          # makes the launch token, prints the sign-in link, runs next start -H 127.0.0.1 -p 3100
├── src/proxy.ts               # Host allowlist + session cookie check (role: viewer) on every route
├── src/app/
│   ├── layout.tsx, globals.css, page.tsx              # Overview
│   ├── assessments/page.tsx, assessments/[uid]/page.tsx (tabs: summary · timeline · findings · scope · approvals)
│   ├── findings/page.tsx, policy/page.tsx, login/page.tsx
│   └── api/session/route.ts, api/assessments/[uid]/route.ts (JSON download)
├── src/lib/data/              # server-only: read folder, schema.ts (zod), stats.ts (all the counts)
├── src/components/
│   ├── neu/                   # Card, Kpi, Chip, Segmented, Field, Table, Notice (reused everywhere)
│   ├── charts/                # SeverityBars, PerDayColumns, CategoryBars (each with a table view)
│   ├── layout/                # Sidebar, TopBar, ThemeToggle, LiveRefresh
│   └── assessments/, findings/, policy/, timeline/
└── src/styles/brand.css       # GENERATED from reconix/theme.py by scripts/export_tokens.py
```

**Pages** (as in the mockup): Overview (KPIs, severity, per day, recent assessments, needs
attention, categories, templates) · Assessments (filters) · Assessment detail · Findings
explorer · Policy & approvals · first-run empty state · sign-in.

**Live refresh:** a small client component calls `router.refresh()` every 10 s while the
tab is visible ("Live · updated hh:mm:ss"), so a running assessment in the TUI shows up
without reloading.

## 3. Security

- Bound to `127.0.0.1` only. `proxy.ts` refuses any `Host` other than
  `127.0.0.1:3100` or `localhost:3100` (blocks DNS rebinding).
- Launch token: a new one on each start. The link is `/login#token=…` (in the fragment,
  so it stays out of logs). The page posts it once, gets an HttpOnly SameSite=Strict
  cookie, and clears the fragment. Every page and route requires the **viewer** role.
- Read-only: there are no write routes. The only POST is the sign-in.
- Files are read only from `DATA_DIR`, by names matching `^[0-9]{8}-[0-9]{6}_[A-Za-z0-9-]{1,64}\.json$`,
  up to 5 MB each, and every file is validated by zod before use.
- React escapes all text, and nothing uses `dangerouslySetInnerHTML`. Security headers come
  from `next.config.ts` (nosniff, `X-Frame-Options: DENY`, referrer policy, CSP).
- The saved files hold findings, so the folder is 0700 and files are 0600.

## 4. Running it

```bash
python -m reconix                  # run assessments as today; they are saved as they run
cd web && npm ci && npm run build  # once
npm start                          # prints http://127.0.0.1:3100/login#token=… and opens it
npm run dev                        # UI work with hot reload (same token flow)
```

## 5. Build order (each step keeps `pytest -q` green)

1. `snapshot.py` + `persist.py` + `SESSION_ID` + dashboard autosave + tests (schema shape,
   atomic write, permissions, no secrets, off switch).
2. A sample-data script (`scripts/make_sample_data.py`) that plays the four templates
   through the store into a folder, for web development and tests.
3. Web scaffold: Next 16 + Tailwind v4 + next-themes, neumorphism tokens, `export_tokens.py`,
   `start.mjs`, `proxy.ts`, sign-in. Before writing Next code, read
   `node_modules/next/dist/docs/` (v16 differs).
4. Data layer: reader + zod schema + stats, with vitest tests on the sample data.
5. Pages: Overview → Assessments → Assessment detail → Findings → Policy → empty state.
6. Playwright: start on the sample data, visit every page in both themes, check that the
   counts match the files.
7. README, CLAUDE.md, then `security-reviewer` and `code-reviewer`.

## 6. Verification

- `pytest -q` (new: snapshot/persist tests, the secret-leak test on saved files).
- `npm run lint`, `npx tsc --noEmit`, `npm test` (data layer and stats).
- `npx playwright test` (all pages, both themes, sign-in required, wrong Host refused).
- Manual: run a Web URL assessment in the TUI. While it waits at the HIGH approval, the web
  shows it as "Awaiting input". After it finishes, the Overview counts it.

## Status (built 2026-10-05)

Steps 1–7 are done. `pytest -q` (224), `npm test` (45), `npm run lint`, `npm run typecheck`
and `npm run e2e` (16, Playwright) all pass; there are no browser console or CSP errors on
any page in either theme.

How the build differs from the plan above:

- **No Radix or TanStack Table.** Tabs and filters are links and GET forms rendered on the
  server (every view has a URL and works without JavaScript); tables are plain HTML. Only
  the per-day chart (recharts), the theme toggle, live refresh, nav highlight and sign-in
  run in the browser.
- **Session cookie is stateless:** `viewer.<HMAC(launch token, role)>`, so a restart (new
  token) signs everyone out. Sign-in also checks the request's Origin.
- **CSP** uses a per-request script nonce (`'strict-dynamic'`); styles allow inline
  attributes (bar widths, chart layout).
- **File names** carry a random suffix: `<YYYYMMDD-HHMMSS>-<4 hex>_<id>.json`
  (`lists.SESSION_ID`), so two TUI sessions started in the same second never collide.
- **Saved copies** are written only once a run has started, and only when their content
  changed (the dashboard calls `autosave()` on every redraw).
- Light-theme colors live in `reconix/theme.py` (`WEB_TOKENS`) next to the TUI palette;
  `scripts/export_tokens.py` writes `web/src/styles/tokens.css`.

### After the code and security reviews

- A gate that was decided but not yet advanced is no longer saved as "waiting"; the snapshot
  carries `waiting_gate` / `waiting_request_id`, and the web matches approvals by id.
- Leaving an assessment (switch or new) saves it first; quitting the TUI marks every saved
  copy `session_closed`, and the web shows a run that was still going as **Interrupted**.
- Secrets in free text: the parser drops `user:pass@` from target URLs, `store/redact.py`
  masks credentials in everything saved and imported, and the prompt refuses text while a
  login is asked for. A crafted import (lone surrogates) can no longer crash a save.
- Writes use `mkstemp` (no predictable temp file), refuse a data folder owned by someone
  else, and tighten a folder others can write to.
- Web: files are opened with `O_NOFOLLOW|O_NONBLOCK` and checked through the handle, at most
  1,000 files are read; the data loader checks the viewer role itself (behind the proxy);
  the cookie carries an issue time the server checks (12 h); the browser is opened through
  a private redirect file so the token is not on any command line.
- Accepted as is: the sign-in link works until the dashboard stops (so a second browser can
  sign in); cookies are per host, not per port, so don't run untrusted services on 127.0.0.1.
