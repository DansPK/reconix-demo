# Plan — Redesign V3: Figma workflow, prototype and design system, plus the remaining web work

Status: **built and merged** into `redesign/v3` (2026-10-20), see §5 for what was checked and
what is left. This plan answers the "Master implementation prompt" of 2026-10-20.

## 1. What is there today (inspected)

### Code
- **Branch `redesign/v2` @ `80bce6d`**: the v2 redesign is merged. It already does many of the
  prompt's items:
  - four summary cards (Findings, Assessment progress, Tool execution, Duration);
  - the Audit Log view removed, with the audit kept in the files and the TUI;
  - three panels (Findings by Severity, Activity and Execution timelines);
  - the ≈1.6 s open and 1.4 s close transitions, the one globe at 18 % behind the welcome,
    fading out once chat starts, and the 6 s breathing on the icon, globe and panel;
  - an assistant in the style of ChatGPT and Claude: Markdown, code with Copy, Stop and Retry,
    "New messages" (scroll to bottom), cards the server builds, persistent history in
    `~/.reconix/assistant`, and no microphone;
  - native scrolling, with Lenis on the docs only.
- **Uncommitted on top: the Scope and Report views redesign** (`docs/WEB_SCOPE_REPORT_PLAN.md`).
  Checked so far: typecheck, lint, vitest 388/388, and the e2e pages, a11y and scroll specs
  (64/64). The motion and assistant specs have not been re-run yet.
- **`main` has one commit `redesign/v2` lacks**: `e98f65a`, "integrate configurable LLM
  assessment agents" (14 Oct).
  - It adds `backend/` (86 files), 28 TUI files and the commands `/assess`, `/provider` and
    `/model`.
  - It touches no file under `web/`; the only file both branches change is `CLAUDE.md`.
  - **The docs can only describe `/model` once this is merged.** On `redesign/v2` there is no
    `/model`, and the TUI has no model at all (rule-based, simulated run).
- **The old v2 worktrees** (`reconix-wt/{motion,assistant,dashboard,scroll}`) are merged and
  take 4.2 GB. Their branches `redesign/v2-assistant` and `redesign/v2-dashboard` already use
  two of the suggested branch names.

**Gaps against the prompt (measured or read in code):**

| Area | Today | The prompt wants |
|------|-------|------------------|
| Overview height | Fits at 1920×1080 and 1440×900. **Scrolls 78 px at 1366×768.** 1280×720 is below the fixed frame (760 px tall), so the page scrolls by design. | Fit at standard desktop sizes. |
| Findings | One list, no paging (~3,000 px tall). The list and detail scroll together. Phones stack them. | 10 per page; a list pane that scrolls on its own; a stable detail pane; list then detail on small screens. |
| Severity | 5 rows. The data has HIGH 14 · MEDIUM 8 · LOW 8 (saved runs) and 3 · 8 · 7 (sample), CRITICAL and INFO 0. | Three primary rows (LOW, MEDIUM, HIGH) without hiding CRITICAL or INFO. |
| Assessments | No view: only the top-bar switcher, plus the Report table of every run. | A navigation destination: list, search, filter, page, open. |
| Reports | One assessment per file (PDF, HTML, JSON, CSV, SARIF). PDF is printed by headless Chrome on the server. `previewHref` points to a page that does not exist. The TUI can't combine runs either. | Pick 1–5 runs, set options, preview, then one combined PDF built from the same renderer. |
| Docs | 22 pages, some inaccurate: `reconix viewer` (no such command), a VS Code extension, `NVD_API_KEY`, drafts. No Copy on code. Search only in the dashboard top bar. No redirects. | A terminal guide built from the real commands, one page per command, search, Copy, and a redirect from `/docs/getting-started/configuration`. |
| Globe opacity | The constant 0.18 in `MOTION`. | 18 %, configurable from 10 to 30 %. |

### Figma
- **Design file "Untitled" (`xQ7J9ZesoAfPyldKmgRhm1`)**:
  - Signed in as *Vanneth Yann*, in the "Reconix folder", **Free plan**.
  - Pages: **UI** (0:1), **Design system** (1:2), **Page 3** (1:3). All three are empty: no
    variables, styles or components. The Free plan allows 3 pages, so no page can be added.
  - The editor shows Design, Prototype and Share, which suggests edit access. This is not proven
    by a write yet.
- **FigJam "Public page workflow" (`kkrYmYIcNTz2Qbg66WIoMm`)**: **not inspected**. The owner was
  using the laptop, so the browser was left alone. Its existing public-page workflows are kept
  as they are; ours go into a new section.
- **Tooling, by the owner's standing rule**: no Figma MCP. Figma is edited through the Plugin API
  in the owner's Chrome tab (Claude in Chrome `javascript_tool`), using the existing builder in
  `Reconix_Figma_Pack/builder/` (lib: core, vars, components, layout, proto, text; numbered
  steps; everything tagged `reconix`/`key`).
  - **Consequence:** Figma edits run in one browser, one at a time, and need stretches of time
    when the owner isn't using it.
  - Subagents can still **write** the builder steps in parallel (offline files); the main agent
    **runs** them in the browser.

## 2. Phases

### Phase 0 — main agent (one at a time)
1. Re-run the motion and assistant e2e specs on the Scope and Report work, then commit it on
   `redesign/v2`.
2. Create the integration branch **`redesign/v3`** from that commit and **merge `main`**
   (`e98f65a`; only `CLAUDE.md` should conflict). Run pytest and the web checks.
3. Shared contracts, committed before anyone branches:
   - **Views:** add `assessments` to `VIEWS`, its sidebar item and an empty view, and the
     findings `page` parameter in `VIEW_FILTERS`. `page.tsx` gets every view with a stub.
   - **Shared UI components**, built and unit-tested in `components/ui/`: `Pagination` (10 per
     page, Previous/Next, "Page 2 of 3 · 30 results"), `Checkbox`, `CopyButton` (from the
     assistant's code block), and `ListDetail` (two panes, or list then detail on small screens).
   - **Styles:** one stylesheet per area (`findings.css`, `assessments.css`, `reports.css`,
     `docs.css`), so no two agents edit one stylesheet.
   - **Tokens:** only the main agent changes `theme.py` / `lib/status.ts`.
   - **Combined report API contract:**
     `GET /api/reports/combined?uids=a,b&format=preview|pdf|docx&evidence=1&low=1&appendix=1`
     (2026-10-21; it was `pdf|html`, see §5.2).
     It needs `viewer`, accepts 1–5 distinct valid uids (else 400), `format` defaults to
     `preview` (the HTML, shown only in the Report view's frame, never a download),
     and each option is a flag (`1`/`true` on; absent, `0` or `false` off) — so a bare `?uids=a`
     builds the report with every option off; the Report view's panel starts with all three on.
     It only reads (one read of the folder per request) and writes nothing; 404 names a missing
     run, 501 (no browser to print the PDF) carries the Word (DOCX) report's link.
4. One worktree per workstream: `reconix-wt3/<area>` on `redesign/v3-<area>`.

### Phase 1 — parallel workstreams (code, each in its own worktree)

| # | Workstream | Owns (files) | Delivers |
|---|------------|--------------|----------|
| E1 | Dashboard | `overview-*`, `summary-strip`, `findings-card`, `derive*.ts` (Overview parts), Overview section of `dashboard.css`, `frame.css` | Fits 1366×768 without the 78 px scroll; severity: HIGH, MEDIUM and LOW always, CRITICAL and INFO rows only when present (never merged into another); timelines checked at every size |
| E2 | Findings | `findings-view` (split into list, detail and pager files), `filters.ts`, `findings.css` | 10 per page; a deep link opens the finding's page; the list pane scrolls on its own on the fixed frame; detail keeps its header and scrolls inside only when needed; Previous/Next finding; on phones a list then detail with Back (a history entry); empty, no-match and error states |
| E3 | Reports | `lib/report/combined/*` (new), `app/api/reports/combined/route.ts` (new), `reports-view`, `report-runs`, `reports.css`, `csp.ts` (if framing changes; security review) | Pick runs (1–5, the 6th is disabled with a reason), selected count, Clear, options, Preview (the same HTML the PDF prints, in a sandboxed frame), Generate (fetch, wait for the finished file, then download one file); the combined report's 10 sections; unique findings vs occurrences; missing-data, preview-failure and export-failure states; unit tests and a real PDF in e2e |
| E4 | Assessments view | `assessments-view*` (new), `assessments.css` | Every saved run: search, status and template filters, 10 per page, opens the run's Overview; reuses `ReportRuns` rows and `Pagination` |
| D | Motion and assistant | `components/assistant/*`, `motion.css`, `assistant.css`, `sidebar.tsx`, `lib/assistant/cards.ts` | Globe opacity clamped to 0.10–0.30; checks that the 1.6 s open and 1.4 s close keep the filters, chosen run and scroll; active sidebar animation; reduced-motion fade; cards for tool results, recorded approval decisions, policy restrictions and errors (built from saved data only); an empty-reply state |
| E5 | Docs | `content/docs/*`, `docs-nav.ts`, docs components, `next.config.ts` (`redirects` only), `scripts/export_commands.py` (new) | The new structure (below); command pages built from `COMMANDS` through an export script, with a test that fails when they drift apart; search and Copy on the docs pages; a redirect for every old page |
| F | QA and accessibility | `e2e/*` (new specs only), test reports | The sizes 1920×1080, 1440×900, 1366×768, 1024×768, 768×1024 and 390×844; axe on every new view; keyboard and focus checks; report consistency (preview equals export); runs again after every merge |

Reviews before each merge: the `code-reviewer` and `security-reviewer` agents (read-only), then
the main agent. Nothing incomplete or failing is merged, and no branch is deleted or
force-pushed.

**New docs structure** (every command checked against `COMMANDS` after merging `main`):
- Getting started: introduction, requirements, installation, launching, first steps.
- Terminal guide: the screens, keys (`→`/`←`, `/`, `?`, `1`–`8`, Ctrl+O, Ctrl+Q and per
  screen), slash commands, the flow.
- AI models: `/model`, `/provider`, configuration and common errors (from `main`'s code).
- Commands reference: one page per command (19 on `main`), each with purpose, syntax, example,
  what happens and common errors.
- Security assessment guide: request, scope, plan, tools, policy checks, approval gates (HIGH
  double check), execution, findings.
- Reports: reviewing, findings, preview, export, combining up to five (in the web dashboard).
- Troubleshooting: model connection, missing tools, policy errors, unknown commands, report
  failures.

### Phase 1 — Figma (written in parallel, run in the browser one step at a time)

| # | Owner | Where | Delivers |
|---|-------|-------|----------|
| C | Design system | page **Design system** | Variables from `theme.WEB_TOKENS` (one mode, dark), including the TUI severity scale and status tones; text styles; spacing and radius; about 30 component sets with hover, focus, active, disabled, loading and selected variants (the list in §12 of the prompt); usage, accessibility and motion notes |
| B | UI and prototype | page **UI** | 1440×900 and 390×844 frames for Overview; Assistant (welcome, conversation, streaming, error, history, empty history); Findings (list and detail, empty, phone list, phone detail); Assessments; Scope; Report (one run, every run, selection, preview, generating, success, error); Docs (page, search, phone navigation). Instances of C's components only; prototype links for every flow in §8 |
| A | Workflows | FigJam: a new section **"Reconix Local Application"** | Workflows 1–6 plus error and fallback paths, a legend, decision nodes and connected arrows, all checked against the code |
| main | Specs | page **Page 3** (renamed "Specs & handoff") | Motion values (`MOTION`, `BREATH_MS`), what the Figma prototype can't reproduce, responsive rules |

Order: C's tokens and components first, then B's screens, then the prototype links (checked by
the main agent). A can run any time. C and B agree on component names and properties (a
contract file) before B starts. Every node carries the builder's `reconix`/`key` tag, so a
re-run updates our nodes and never touches anyone else's.

### Phase 2 — integration
Merge each reviewed branch into `redesign/v3`, test after every merge, do a real-data browser
pass at every size, compare against the Figma screens, and write the final report (completed,
partial, blocked or unverified).

## 3. Decisions for the owner (a recommendation for each)

1. **Baseline:** commit the Scope and Report work on `redesign/v2`, branch `redesign/v3`, and
   merge `main` into it. *Recommended.*
2. **Branch names:** `redesign/v3-<area>` (the v2 names are taken). Remove the four old v2
   worktrees (4.2 GB) and keep their branches. *Recommended.*
3. **Browser time for Figma:** the Plugin API needs your Chrome. Options:
   - (a) you give me windows when you're not using the laptop; *recommended*
   - (b) allow the Figma MCP for these two files (reverses your earlier rule);
   - (c) I prepare the scripts and you run them.
4. **Severity panel:** HIGH, MEDIUM and LOW always shown; CRITICAL and INFO get their own rows
   only when a run has them; the total counts all five. *Recommended.*
5. **Assessments:** a new `?view=assessments` page. The alternative is mapping it onto the
   switcher and the Report table. *New page recommended.*
6. **Combined report:**
   - Formats: PDF and HTML, from one renderer. *Recommended.* (2026-10-21: the downloads are
     PDF and DOCX; the HTML is the preview and the PDF's source only, see §5.2.)
   - Options: include evidence (masked), include LOW and INFO, include the appendix.
   - Unique finding: same title, weakness (CWE) and target; each run it appears in is an
     occurrence.
7. **Docs:** replace every current page and redirect each old URL to its nearest new page.
   *Recommended*, since several current pages describe things the CLI doesn't have.
8. **Globe opacity:** a constant held between 0.10 and 0.30 in `motion.ts`, with no settings
   screen. *Recommended.*
9. **Figma "Page 3":** rename it "Specs & handoff" and use it for motion and responsive specs.
   *Recommended.*
10. **Figma vs code order:** both from this plan in parallel, compared at the end.
    *Recommended*, since the browser makes Figma slow. The alternative is to design new screens
    in Figma first and wait for your approval.

## 4. Blockers and limits
- FigJam not inspected yet (browser in use).
- Figma edit access is not proven. The first step after `START` is a write test with a tagged
  frame that is then removed.
- The Free plan allows 3 pages (all used), one variable mode and no library publishing, so the
  design system stays local to the file, as asked.
- The PDF needs Chrome or Chromium on the machine (`/usr/bin/chromium` exists here); otherwise
  the route answers 501 with the HTML instead.
- Combined reports are web-only (read-only, built on request). The TUI keeps its own per-run
  export.
- Scale: about 7 code agents plus 3 Figma authors and reviewers. That is a lot of tokens and
  hours, and the Figma part is limited by browser time.

## 5. Status (2026-10-20, branch `redesign/v3` at the end of the parallel build)

Every workstream was reviewed (code-reviewer + security-reviewer, fixes applied) and merged:
Phase 0 → assessments (E4) → dashboard (E1) → assistant (D) → reports (E3) → docs (E5) →
findings (E2). Nothing is pushed; the `reconix-wt3/*` worktrees and their branches are kept.

**Checks on the merged branch:** `pytest` 755 passed; ruff: the 7 findings all pre-exist on
`main` (E501 ×5, E402 ×2); `typecheck`, `lint` clean; vitest 526 / 526; `next build` ok;
Playwright 134 passed, 1 skipped (the motion spec's Findings scroll check now follows the list
pane, which is its own scroller since the paging).

**Real data (`~/.reconix/assessments`, 27 runs, 30 findings: HIGH 14 / MEDIUM 8 / LOW 8),
built app, Chromium:** the Overview fits with 0 px of hidden height at 1920×1080, 1440×900 and
1366×768 (the one-run and every-run views; measured after the intro settles); no horizontal
overflow on any view at 1920×1080, 1440×900, 1366×768, 1024×768, 768×1024 or 390×844; below
the fixed frame the window scrolls as designed; Findings shows ten rows a page with Previous /
Next and the detail beside it (list-then-detail on the phone); the combined report selects five
runs, disables the sixth with a reason, previews in a sandboxed `srcdoc` frame and downloads one
PDF (`combined-5-runs-2026-10-20.pdf`, 811 KB); `/docs/commands/model` renders at every size.
No page errors were logged.

**Figma:** design file `xQ7J9ZesoAfPyldKmgRhm1` — "Web — Design system" (42 variables, 9 text
styles, 3 effect styles, 40 icons, 35 component sets / 188 variants), "Web — Screens &
Prototype" (43 frames, 5 flows, 349 reactions, no missing edges) and "Specs & handoff" (motion,
responsive rules, severity/status meanings, how the file was built). FigJam board
`kkrYmYIcNTz2Qbg66WIoMm` — section "Reconix Local Application" with the seven workflows in the
board's own rule and Example format (built by `dist/figjam/W60`, `W61`).

**Partial / unverified:** the Figma prototype cannot carry the WebGL globe, the staggered
pieces or the streaming text (documented on the specs page); the AI Assistant's cards were
checked against the stub model only (no real model was called); the dedicated QA sweep (F) is
covered by the e2e suite rather than a separate report. **Known, not fixed:** `/assess` while an
agent turn is in flight does not cancel the old worker (`reconix/shell/agent.py`, found by the
docs review); the scope's methods / paths / ports / time limit are not enforced on the AI agent
(documented honestly in the Assessment guide).

### 5.1 Follow-up round (2026-10-21)

Three read-only audits (dashboard code against the Rules, docs/TUI/repo hygiene, tests) led to
five reviewed workstreams, merged into `redesign/v3` in this order:

- **A · agent mode** — every AI-agent tool call is checked against the approved scope
  (`reconix/store/agent_guard.py`, one rule set in `policy.request_reason` shared with the
  scripted run): target host, tool set, time limit, methods and excluded paths (web), ports
  (network), source scopes refuse network tools; refusals go back to the model, show as POLICY
  lines, raise the blocked count and are audited. The per-action MEDIUM/HIGH gates still do not
  apply to the agent. `/assess`, `/new`, switching and quitting cancel a running turn
  (generation counter; the run left behind reads Stopped). Tool arguments and results are
  masked before they reach the activity log; logins never follow redirects; plan labels are
  masked before they are cut.
- **D · docs and hygiene** — `CLAUDE.md`, `README.md`, `web/README.md` describe v3;
  `scripts/export_commands.py --check`; `/reports/` anchored in `.gitignore`; ruff at 0.
- **B · dashboard quality** — one address writer (`writeQuery`, queued until hydration), report
  masking at the route boundary (`lib/report/mask.ts`), one run row (`run-cells.tsx`), one
  pager (hidden on a single page), `lib/scroll.ts`, live regions and keyboard fixes, the `DOCS`
  link map with a test, dead code removed, no Turbopack warning.
- **C · tests** — 13-run sample data (all five severities, a false positive, a run stopped
  before scope, zero-finding runs, a running run, a masked login), every skip turned into a
  check, Playwright split into parallel and serial projects with one sign-in, flake fixes.
- **G · accessibility** — axe clean on every page the suite visits (a web-only `sev-critical`
  token at 4.93:1 on its badge, underlined docs links, single-interactive search options,
  `ui/scroll-region.tsx` for sideways scrollers), motion floors derived from `MOTION`.

**Checks on the merged branch:** `pytest` 798, backend 28, ruff 0, typecheck and lint clean,
vitest 553, `next build` without warnings, Playwright **196 passed** (0 skipped, 0 flaky).
**Real data** (27 runs): the Overview hides 0 px at 1920×1080, 1440×900 and 1366×768; no
view scrolls sideways at any of the six sizes; no error screen or page error; the combined
report of five runs previews in a sandboxed `srcdoc` frame and downloads one PDF (800 KB).

**Figma:** the badge defect (bound colour variables drop paint opacity on assignment and on
every instance) is fixed in the builder (`rx.setTint`); every screen was rebuilt and reviewed
against the running dashboard; the FigJam board gained workflows 8–10 (Overview, Scope,
Terminal). The prototype is being wired against a click map of the real dashboard
(50 states, 2,541 interactive elements) with a parity table in the builder.

### 5.2 Report formats: PDF, JSON and DOCX (2026-10-21)

**Owner's decision:** a report is saved as **PDF, JSON or DOCX**, in the TUI and the web alike.
The report HTML is internal: the PDF's source and the combined report's preview, never a
download. The CSV, SARIF and Markdown writers are gone.

- **TUI:** the Report screen's keys are `p` / `j` / `w` (bindings and buttons from one list),
  `/export` offers the same three; python-docx is a runtime dependency (`requirements.txt`,
  `pyproject.toml`). `reconix/store/report_view.py` is the one outline the PDF's HTML and the
  Word report both read, so the DOCX has the PDF's sections, order and headings (severity
  counts, approval status, the scope disclaimer, severity-then-id order, the analyst's note).
  The print toolbar and script are gone from the HTML.
- **Web:** `GET /api/assessments/<uid>/export?format=pdf|json|docx` (always an attachment; the
  `inline=1` path and the CSP's framing exception are gone, every route is
  `frame-ancestors 'none'`) and `GET /api/reports/combined?…&format=preview|pdf|docx`. A
  dependency-free Word writer in `web/src/lib/report/docx/` (stored ZIP, OOXML from a small
  block model, one run per value, a 16 MiB cap on `document.xml` answered with 413 by both
  routes). The Report view's rows offer all three files, and the Selection panel has
  **Generate PDF** and **Generate DOCX** (`components/dashboard/report-file.tsx`); a 501 (no
  printer) links the DOCX.
- **Review fixes:** `redact.clean()` drops the control characters XML can't hold (a crafted
  import could crash the TUI's DOCX export; a refused value is now a `StoreValidationError`);
  Python masks a list of strings as one text like the web's `maskStrings` (a private key stored
  one line per evidence entry is masked whole; shared vectors in
  `web/tests/redact-list-vectors.json`); the docs and plans say three formats; e2e checks the
  sideways scroller on `/docs/commands/provider`; new tests for DOCX masking of every field,
  well-formed XML in every part, the size cap and the export routes.

**Checks:** `pytest` 811 passed, ruff 0, `export_commands.py --check` up to date, `compileall`
clean; `typecheck` and `lint` clean, vitest 615 passed (36 files), `next build` ok, Playwright
**198 passed** (0 skipped, 0 flaky). A single-run and a combined web DOCX and a TUI DOCX all
open in python-docx, with the PDF's numbered sections.
