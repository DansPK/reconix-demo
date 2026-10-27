# Reconix analysis dashboard (web)

A local dashboard for what the Reconix terminal app did, opened from the TUI with `/web`. It
reads the assessments the TUI saves to `~/.reconix/assessments/` and shows them as the
**Assessment Operations Center** (the globe UI from the reconix-web-ui site), with Assessments,
Findings, Reports, AI Assistant and Security knowledge views, all
switched in-page (`?view=`; each view's
own address keys and every run link live in `components/dashboard/view-url.ts`). By default the
Overview totals **every saved run** (`derive-overall.ts`) and Findings lists them all, each
naming its run; the Assessment switcher in the top bar opens one run instead (`?uid=`) and
searches every saved run. With every run shown, Reports lists every run and combines them. The
page re-reads the files every 10 s (`RECONIX_LIVE_REFRESH_MS`; `0` turns it off). (The Scope
view was removed: an old `?view=scope` opens the Overview; the scope stays in the saved files,
the reports and the TUI.)

- **Overview:** a summary strip (Findings with the worst severity, Assessment progress with its
  state, Tool execution, Duration with a meter against the time limit) over the globe hero with
  the Ask bar; three panels: **Findings by Severity** (a stacked bar and four rows, Critical,
  High, Medium, Low, each even at 0: the only levels there are (an older file's Info findings are
  dropped as it is read); review state, top CVSS findings), the **Activity Timeline** (lanes by kind with clustered marks that expand,
  masked text; with every run shown, runs per day stacked by status) and the **Execution
  Timeline** (a row per plan step, a shared tool track and the waiting gate; with every run
  shown, the newest 8 runs).
- **Meanings:** every status, step, approval, policy decision and severity is a badge with an
  icon, a label and a tooltip from `lib/status.ts` (`components/ui/status-badge.tsx`); severity
  uses the TUI's own scale. Colour is never the only signal; every chart has a legend.
- **Assessments:** every saved run, newest first, ten a page, with a search and status and
  template chips (`?view=assessments&q=api&status=Completed&template=API&page=2`); a row opens
  that run's Overview.
- **Findings** filter by severity and validation and search title, ID, CWE and target, ten
  rows a page with Previous / Next; the filters, the page and the open finding live in the
  address (`?sev=HIGH,LOW&val=review&q=sql&page=2&finding=F-001`), so a link opens on its
  finding's page. The finding's evidence and remediation sit beside the list; on the fixed
  desktop frame the list scrolls on its own under the filters with no scrollbar drawn (wheel,
  touch, trackpad and keys still move it; the detail and the page keep theirs), and on a phone
  the list and the detail take turns (Back returns to the list). Ten rows a page is
  `lib/paging.ts`, shared with Assessments and the Report view's runs. False positives are left
  out of the list as they are out of every count (so its headline and chips are the Overview's
  numbers); the **False positives · Show** chip (`?fp=1`) lists them, beside the total
  ("Showing 41 of 40 findings + 1 false positive"), and a link naming one while they are hidden
  says so, with **Show it**.
- **Reports:** the Overview's summary strip and Findings by Severity, its top list cut to the top
  3 CVSS findings (`derive-report.ts` `REPORT_TOP_FINDINGS`; the Overview's card shows more).
  With every run shown, the **Targets** card beside it lists every target, the most findings
  first, 7 a page with Previous / Next (`?tpage=`, `report-targets-paging.ts`): the two cards are
  the same height, and the list keeps room for a whole page, so a shorter last page moves neither
  the card nor the pager at its foot.
- **Drill-down:** the Findings card opens every finding, a severity row opens Findings filtered
  to it, a top finding opens itself.
- **The top bar** holds the live-refresh pill, the switcher, the run's (or every run's) chips
  and the docs search; it has no bell (`../docs/WEB_NO_TERMINAL_BELL_LOGO_PLAN.md`). **The
  sidebar** is the views rail with Documentation at its foot, and no logo. **The switcher** is
  just the list: the open run's name (a link to its Overview),
  a search past six runs, "All assessments", one row per run, and a warning when a saved file
  was skipped and why. Those views never change
  anything; there is no Terminal view: assessments run and are decided in the TUI
  (`python -m reconix`). `/docs` holds the project's documentation, read
  in place (`../docs/WEB_DOCS_INLINE_PLAN.md`): one page per group (`lib/docs-nav.ts` over
  `content/docs/`: getting started, the terminal guide (the TUI's screens and keys), AI models,
  the commands, the assessment guide, reports, troubleshooting, guardrails), each showing all of its pages as parts anchored
  `#<page>` (their sections `#<page>-<section>`); `/docs` itself shows Getting started. Nothing
  in the docs links off the page but the docs sidebar's groups; the search looks through the
  group shown and jumps within the page. Every old address, a page's own `/docs/<group>/<page>`
  included, redirects (308) to its anchor through `lib/docs-redirects.ts`.
  (The Audit log view was removed; the audit data stays in the saved files and the TUI.)

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 · GSAP ·
three.js · zod · lucide-react. Dark only. See `../docs/WEB_GLOBE_UI_PLAN.md` for how it
replaced the earlier pages, `../docs/WEB_REDESIGN_V2_PLAN.md` for the v2 redesign and
`../docs/WEB_REDESIGN_V3_PLAN.md` for v3 (Assessments, paging, the combined report, the docs;
§5 holds its status).

## Run

```bash
npm ci
npm run build
npm start                          # http://127.0.0.1:3100, prints and opens the sign-in link
RECONIX_DATA_DIR=sample-data npm start   # the sample assessments instead of your own
npm start -- --no-open             # don't open a browser
```

| Variable | Default | Meaning |
|---|---|---|
| `RECONIX_DATA_DIR` | `~/.reconix/assessments` | the folder the TUI saves to |
| `RECONIX_STALE_AFTER_HOURS` | `12` | an unfinished run whose file has not changed for this long reads as Interrupted (its TUI was killed before it could say so); `0` turns this off, e.g. for the old sample data |
| `RECONIX_LIVE_REFRESH_MS` | `10000` | how often the page re-reads the saved files; `0` turns the live refresh off (the e2e server does) |
| `RECONIX_CHROME` | the usual names on PATH, then the common install paths | the Chrome/Chromium that prints the PDF exports; without one the PDF routes answer 501 |
| `RECONIX_WEB_PORT` | `3100` | port on 127.0.0.1 |
| `RECONIX_PYTHON` | repo `.venv`, else `python3` (`python` on Windows) | the Python that runs the knowledge CLI |
| `RECONIX_KNOWLEDGE_DIR` | `~/.reconix/knowledge` | the knowledge folder (the TUI's `/add-on` and the Security knowledge page) |
| `RECONIX_KNOWLEDGE_KEY_FILE` | `~/.reconix/knowledge.key` | the key the knowledge CLI encrypts the kept originals with (passed on to it) |
| `RECONIX_WEB_TOKEN` | random per start | only for tests; normally `scripts/serve.mjs` makes one |

## Sign-in

`scripts/serve.mjs` starts Next.js on 127.0.0.1 with a fresh launch token and prints the
sign-in link; the sign-in route trades it for the session cookie. There is no terminal in the
dashboard (no `/terminal`, no `/api/terminal/*`, no terminal key cookie or ticket): the TUI
runs in your own terminal. **The sign-in link** grants everything (there are no roles), so
`serve.mjs` prints it only to a terminal; started by the TUI, it is only in
`~/.reconix/web.url` (0600).

## AI Assistant

The Overview's Ask bar and the sidebar's **AI Assistant** tab open the same chat
(`?view=assistant`; `/assistant` redirects there; one history entry, so Back returns).

- **Transition** (`components/assistant/motion.ts`, `MOTION`): about 1.6 s to open and 1.4 s to
  close on the fixed desktop frame. The top bar and summary strip go up, Findings by Severity
  right, the timelines down, all fading, while the surface grows from the hero box to the area
  beside the sidebar; the assistant's header, conversation and composer come in last. Phones,
  tablets and a direct load crossfade (0.3 s); reduced motion is a 0.22 s fade.
- **One globe:** the hero's three.js globe is carried into the assistant (never a second WebGL
  context; `use-globe.ts`) and sits behind the welcome at about 18 % opacity; once a
  conversation has messages it fades out and stops drawing (also when hidden, or on low-power
  devices, where it holds a still frame).
- **The mark:** the header and each reply show the terminal's logo, the cyan ◆ on its dark tile
  (`components/ui/reconix-mark.tsx`, drawn as the favicon `app/icon.svg`; tokens `--surface`
  and `--globe-glow`, the TUI's cyan). It holds still, except that a reply's mark glows while
  the reply is being written.
- **Breathing** (`breath.ts`, `styles/motion.css`): one 6 s cycle shared by the sidebar's AI
  icon, the globe and a live reply's mark (a glow, never a scale), started once the open has
  settled, on its own layer. Nothing that holds text breathes: the chat panel and its card are
  static once messages exist (scaled text vibrates while reading); reduced motion shows a still
  halo (and a still glow) instead.

- **Model:** any OpenAI-compatible endpoint, as the product docs' "Model switching", added with
  the composer's **+ Model** and saved by the dashboard. The web reads no model from its
  environment (`LLM_BASE_URL`, `LLM_MODEL` and `LLM_API_KEY` are not used); until one is added
  the screen says "No AI model is set up yet. Add one with the model chip under the message box
  (+ Model)." Cloud providers and any address off this machine work by default
  (the owner's decision, 2026-10-22; no server switch): assessment data goes there, and the
  picker says so when one is chosen, the chip's tooltip while it answers. A remote endpoint
  takes an API key over https only.
- **The composer** (`composer.tsx`): a rounded box (radius 16) with the text area on top and a
  row under it: the model chip on the left; on the right "Enter to send · Shift+Enter for new
  line" (hidden on a phone) and the round 32 px send button (Stop while a reply is written).
  Under the box: "Answers use your saved assessment data. Scans and approvals stay in the
  terminal." The header has no model control.
- **Choosing a model** (`model-chip.tsx`, `model-picker.tsx` with `model-list.tsx` and
  `model-provider-form.tsx` (+ `model-key-field.tsx`, `model-name-field.tsx`), the rules in
  `model-picker-rules.ts`, `lib/assistant/models/`): the chip says `● <model> ▾` (green) or
  `● Choose a model ▾` (amber, the reason in its tooltip). It opens a picker upward (a sheet over the composer on a
  phone), a dialog named after its step; Escape goes back to the list, then closes; focus goes to
  each step's first control and back to the chip. **Model**: only your saved models (✓ on the
  active one, the name in mono, "`<provider>` · local|remote"; one click switches, roving
  focus), each with a bin and an inline confirm "Remove `<model>`
  (`<provider>`)? …" (No by default; the provider's last model DELETEs the provider, else its
  list is PATCHed); "No model yet." when empty; **+ Model** at the bottom. **Set the provider**
  (Back, or Cancel, returns to the list): Provider (a native select of OpenAI, Anthropic,
  DeepSeek, OpenRouter, Groq, Ollama (local), LM Studio (local), Custom (OpenAI-compatible), all
  usable, starting on Ollama; a cloud one says "`<Provider>` runs at `<host>`: your questions, the
  assessment data they need and relevant /add-on knowledge passages are sent there." and a
  remote Base URL "Off this machine: …" the same), Base URL (Custom and the local ones only, from the
  preset), API key (uncontrolled, never filled in or kept, emptied with another provider; "Key
  saved: leave empty to keep it" and Remove key for a saved one), Model (a select filled by
  **Fetch models**, `…/models/fetch` = `GET {base}/models`, also fetched once the provider,
  address and key are set; or "Type a model name…"; when the server lists none,
  `…/models/test` for a model the saved provider is known to have). **Add model** tests a typed
  model (or one not from the list fetched for those values), then POSTs a new provider (named
  after its preset, `activate: true`) or, for the same preset at the same address, PATCHes the
  saved one with the model added and PUTs it active; the chip follows without a reload. A
  refusal stays on the form. A saved key goes only to its saved address (the saved provider is
  asked by its id). Providers live in `models.json` in the assistant's folder (0600, atomic), the
  keys AES-256-GCM-sealed with `models.key` (32 bytes, 0600, made once): never sent to the
  browser or logged. `GET /api/assistant/models` also lists the presets in the picker's order
  with their kind. Every model passes the same rules (`config.ts` `checkModel`: http(s), no
  credentials in the URL, the model name pattern, a key only over https to a remote host, a
  cloud preset only at its own address), again on every use: a chosen model that can't be used says why instead
  of falling back. Outbound tests and fetches refuse redirects, stop after 10 s and never cache.
  Routes: `GET|POST /api/assistant/models`, `PATCH|DELETE …/models/<id>`, `PUT …/models/active`,
  `POST …/models/test` and `…/models/fetch` (signed in; changes need the page's origin).
- **Route:** `POST /api/assistant` takes `{ conversationId?, uid, question, retry? }`: a
  session (proxy and handler), same origin, zod-checked, a byte cap, 12 questions a minute and 2
  replies at once (`RECONIX_ASSISTANT_RATE_PER_MINUTE`, `RECONIX_ASSISTANT_RATE_RUNNING`). The
  browser never sends history: the server reads it from the conversation file. It builds the
  model's context from the saved files itself (no evidence lines; every value one line with no
  `<`/`>` or invisible characters, cut, ≈14,000 characters at most) inside a fence with a new
  random tag per question, framed as untrusted data. The reply streams as NDJSON frames
  (`lib/assistant/protocol.ts`: `meta`, `card`, `text`, `error`, `done`).
- **Knowledge** (`lib/assistant/knowledge/`): the route also reads, never writes, the files the
  TUI's `/add-on` keeps in `~/.reconix/knowledge` (`RECONIX_KNOWLEDGE_DIR`; a folder or file that
  is a link, someone else's, writable by others or too big is skipped), ranks their passages
  against the masked question with the TUI's BM25 (`tests/knowledge-vectors.json` checks both),
  and puts the relevant ones (each holds at least two of the question's distinct tokens, or all
  when it has fewer, and scores above 0; the best 4, 4,000 characters counted in code points,
  masked and cleaned again) inside the fence as untrusted reference material, while `meta` names their files for the
  muted "Knowledge used: a.md, b.pdf" under the answer (kept with the saved reply).
- **Cards the server picks** (`lib/assistant/cards.ts`, `intent.ts`): findings, a finding,
  progress, approvals, policy blocks, tools used, report downloads and notices, built from the
  saved data only; the model writes the explanation and never the numbers. Nothing can be run
  or approved from the chat: approvals say "Decide in the TUI" (no button). Questions are masked with the TUI's secret patterns (`lib/assistant/redact.ts`,
  vectors shared with `reconix/store/redact.py` in `tests/redact-vectors.json`).
- **Saved conversations** (`lib/assistant/history-store.ts`): one `<uuid>.json` per
  conversation in `~/.reconix/assistant/` (`RECONIX_ASSISTANT_DIR`; the folder `0700`, files
  `0600`, the parent not writable by others), written atomically, read like the saved
  assessments. A conversation keeps the run it began with; its title is the first question.
  History, rename, delete and "Delete all" through `/api/assistant/conversations[/<id>]`
  (signed in; changes need the page's origin). Kept 30 days after last use
  (`RECONIX_ASSISTANT_RETENTION_DAYS`, `0` keeps them), at most 100 conversations and 200
  messages each. The tab keeps only the open conversation's id and the masked unsent draft.
  Plans: `docs/WEB_AI_ASSISTANT_PLAN.md`, `docs/WEB_REDESIGN_V2_PLAN.md` (the transition and
  the breathing), `docs/WEB_REDESIGN_V3_PLAN.md` (the v3 polish and its status).

## Security knowledge

The AI Assistant's header has a **Security knowledge** button (a book with a lock; just the icon
on a phone) that opens `?view=knowledge` (`components/knowledge/`; no sidebar item).
"← AI Assistant" goes back.

- **Header:** the title, a search over the names, **Table / Grid** (remembered per browser in
  `localStorage`, wrapped in try/catch; with nothing chosen a phone starts on the grid) and
  **Upload**.
- **The files**, newest first, ten a page (`lib/paging.ts`): Name (with its type's icon), Source
  ("Web upload" or "Terminal (/add-on)", with the type and size: "Web upload · PDF · 1.2 MB"; never
  a path), Uploaded (local date and time) and the actions. The grid shows the same as cards. On a
  phone the table's rows stack into blocks; nothing scrolls sideways at 360 px.
- **Upload** (`upload-dialog.tsx`, a native modal `<dialog>`): one `.docx .pdf .txt .md .json .yaml
  .yml` file up to 10 MB, checked in the page first (a `.doc`: "Save it as .docx first"), sent
  with its progress shown, then "Reading the file and masking secrets…"; a refusal keeps the dialog
  open with the server's message.
- **Open** is `/api/knowledge/<id>/original`: PDF, text, Markdown, JSON and YAML in a new tab, a
  Word file downloaded. A file added before originals were kept has Open unavailable, with why.
- **Remove** asks in place ("Remove this file?", No focused, Escape is No).

Routes (a session in `proxy.ts` and again in each handler, `lib/knowledge/access.ts`; changes
need the page's Origin):

| Route | Does |
|---|---|
| `GET /api/knowledge` | the list, read from the index as the assistant reads it (`lib/knowledge/list.ts` over `lib/assistant/knowledge/read.ts`); no path ever |
| `POST /api/knowledge` | one multipart file, counted while it is read (413 past 10 MB), the extension allow-list (`lib/knowledge/rules.ts`); copied to a private temp file (0600 in a 0700 folder, a random name, deleted afterwards whatever happened) and added by the CLI; 201 with the file, 400 with the CLI's refusal, 500 with a fixed message; one at a time (429) and ten a minute |
| `GET /api/knowledge/<id>/original` | the CLI decrypts the kept original; its type by kind, `Content-Disposition` inline (attachment for DOCX) with the name sanitised (RFC 5987), `nosniff`, `no-store` and its own policy, `sandbox; default-src 'none'` for what opens inline (the proxy leaves the page's policy off this route) |
| `DELETE /api/knowledge/<id>` | the CLI removes the file, its passages and its original |

**The process:** every change goes through the same Python code as the TUI's `/add-on`,
`python -m reconix.knowledge add --file <tmp> --name <base name> --source web | original <id> |
remove <id>` (`lib/knowledge/cli.ts`; the contract: `../docs/WEB_KNOWLEDGE_PAGE_AND_MODELS_PLAN.md`).
It runs with the dashboard's Python (`RECONIX_PYTHON`, else the repo's `.venv`, else
`python3`/`python`, as `scripts/serve.mjs` finds it) from the repo root, with fixed arguments, no
shell, an environment of `PATH`, `HOME` and the knowledge folder and key file only (never `LLM_*`
or the launch token), a 60 s limit and a cap on its output; what it prints is never logged. Exit 0
is done, 2 a refusal shown to the operator, anything else a fixed message. Adds and removals run
one after another (`lib/knowledge/gate.ts`). The text is masked and split exactly as in the
terminal, the original is kept encrypted, and the AI still only ever sees the masked passages.
Tests only: with `RECONIX_KNOWLEDGE_CLI_TEST=1`, `RECONIX_KNOWLEDGE_CLI` names a stand-in that keeps the same
contract over a temp folder (`e2e/knowledge-cli-stub.mjs`; it also refuses an environment holding
anything else and an upload copy that isn't private). The e2e server uses it; remove that line
from `playwright.config.ts` to run the e2e against the real CLI.

## Develop

```bash
npm run dev          # hot reload, same sign-in flow
npm test             # vitest: data reader, schema, stats, session, dashboard numbers, filters
                     #   and paging, the docs structure and redirects, the combined report
npm run check:data   # print everything derive.ts computes from a saved file (default: the
                     #   newest in sample-data/, or pass a path)
npm run globe:points # rebuild public/globe/land.bin (dev only; the build doesn't run it)
npm run lint && npm run typecheck   # typecheck needs `npx next typegen` (or a build) first
npm run build && npm run e2e        # Playwright on sample-data (npx playwright install chromium,
                                    #   or CHROMIUM_PATH=/usr/bin/chromium); E2E_PORT moves its
                                    #   ports (default 3199, plus 3197 and 3195)
```

The e2e specs: `access` (sign-in, no roles, an old role cookie refused, no terminal routes,
origin, headers), `pages` (views, switcher, downloads, the docs, no Terminal item, bell or
logo), `assessments` (ten a page, the pager, chips, search,
the address), `findings` (paging, deep links, Previous / Next across a page end, the notice for
a hidden finding, the list scroller and its hidden scrollbars, the phone's list → detail →
Back), `reports` (the top 3 CVSS, the targets 7 a page at the height of Findings by Severity;
combining runs: the selection, the preview frame, one real PDF and DOCX, the 500 / 501 / 413 paths),
`docs` (group pages with their pages in place, no link off the page, the rail without
Configuration, Copy, the in-page search, the old addresses on their anchors, the phone menu), `dashboard-fit` (the
Overview fits the fixed frame with nothing to scroll), `assistant` (with the stand-in model
`e2e/llm-stub.mjs`, saved as the provider "Stub" by `e2e/global-setup.ts` through the models
route, `e2e/models.ts`: the web reads no model from its environment; `[stub:markdown]`,
`[stub:long]` and `[stub:fail]` pick its answers; the composer's model picker against its
`GET /v1/models`), `a11y-assistant` (axe on the picker's list, its remove confirm, Set the
provider with a refusal and a fetched list, and the phone's sheet),
`assistant-knowledge` (an `/add-on` folder written as the TUI does: "Knowledge used" under the
answer, kept after a reload), `knowledge` (the Security knowledge page with the CLI's stand-in: the
assistant's button and back, uploads, the table and the grid, search, Open, Remove, a refused
`.doc`, signed out kept out, a phone, axe), `motion` (directions,
timing, the globe, history), `scroll` (the wheel and keys at six sizes, no sideways scroll) and
`a11y` (axe via `@axe-core/playwright`, focus order). Known faults are listed in the specs as
expected failures that fail with "remove this entry" once fixed. The specs wait for
`html[data-hydrated]` (set by `components/dashboard/viewer.tsx`), never for network idle.

`sample-data/` is generated by `python scripts/make_sample_data.py` (repo root), which plays
at least a dozen runs across the four templates through the real TUI store (every severity,
runs with no findings, a run stopped before its scope was approved, one still running, one
with more than a page of findings), so it always matches the saved format; the specs read their
counts from it (`e2e/support.ts`), never from literals.

## Layout

```
src/
├── proxy.ts                 # Host allowlist, a session on every route (no roles), nonce CSP
├── app/
│   ├── layout.tsx           # fonts (Inter, JetBrains Mono), metadata (no smooth-scroll library: everything scrolls natively)
│   ├── page.tsx             # the viewer: loads the saved runs, every run or ?uid=, derives the dashboard
│   ├── docs/                # documentation in the dashboard frame (layout checks the session): /docs and
│   │                        #   /docs/[group], one page per group (content in src/content/docs/)
│   ├── assistant/           # /assistant → /?view=assistant
│   ├── login/               # sign-in (token from the link's #fragment) → the Overview
│   └── api/                 # session (sign-in), assessments/[uid] (JSON), assessments/[uid]/export,
│                            #   reports/combined (1–5 runs as one PDF / DOCX),
│                            #   assistant, assistant/conversations and assistant/models (+ [id], active,
│                            #   test, fetch: the model picker), knowledge (+ [id], [id]/original: the
│                            #   Security knowledge page)
├── lib/
│   ├── data/                # schema.ts (zod), store.ts (server-only reader), stats.ts (pure),
│   │                        #   adapt.ts (a saved run → the viewer's terms), view-types.ts, format.ts
│   ├── report/              # formats.ts (the export registry), html.ts (report), pdf.ts (Chrome), render.ts,
│   │                        #   combined/ (query.ts validates ?uids=&format=&evidence=&low=&appendix=,
│   │                        #   select.ts merges the runs, html.ts renders, options.ts names the file),
│   │                        #   docx/ (zip.ts, ooxml.ts, report.ts and combined.ts: the Word documents)
│   ├── auth/                # session.ts (launch token, signed cookie, hosts), csp.ts, guard.ts,
│   │                        #   origin.ts (same-origin check)
│   ├── assistant/           # config.ts (the rules every model passes), request.ts
│   │                        #   (zod), context.ts (what the model sees),
│   │                        #   prompt.ts, llm.ts + stream.ts + reply.ts (the streamed reply), protocol.ts
│   │                        #   (NDJSON frames), intent.ts + cards.ts + insights.ts + prompts.ts (cards and
│   │                        #   prompts from saved data), history-store.ts + history-schema.ts (saved
│   │                        #   conversations), secure-fs.ts (the folder's safe file handling), redact.ts,
│   │                        #   markdown.ts, rate.ts, access.ts, client.ts;
│   │                        #   models/ (the model picker: presets.ts, schema.ts, requests.ts, view.ts, crypto.ts
│   │                        #   (AES-256-GCM keys), store.ts (models.json), resolve.ts (which model answers),
│   │                        #   remote.ts (test, fetch), respond.ts, errors.ts);
│   │                        #   knowledge/ (the TUI's /add-on files, read-only: paths.ts, schema.ts,
│   │                        #   read.ts, rank.ts (BM25), index.ts searchKnowledge)
│   ├── knowledge/           # the Security knowledge page: paths.ts, rules.ts (what an upload may be),
│   │                        #   format.ts, types.ts, client.ts (browser); access.ts, list.ts, upload.ts,
│   │                        #   cli.ts (the Python CLI) + commands.ts, gate.ts, original.ts (server)
│   ├── scroll/              # stick-rules.ts + stick-controller.ts (the conversation follows its end)
│   ├── scroll.ts            # scrolling a row into view by hand (never scrollIntoView, which moves the page)
│   ├── paging.ts            # ten rows a page: the page clamped from the address, the label
│   ├── status.ts            # what every status, step, approval, policy decision and severity means
│   ├── docs-nav.ts          # DOCS_NAV (groups → pages, each `/docs/<group>#<page>`), DOCS_ROUTES (/docs + the
│   │                        #   group pages), the DOCS link map, and the commands from commands.json
│   ├── docs-redirects.ts    # the old docs addresses → their anchors (308, loaded by next.config.ts): the v2
│   │                        #   pages, then one rule for every page's own /docs/<group>/<page>
│   ├── docs-search-index.ts # what the docs search looks through (titles, headings, aliases), per group
│   └── globe*.ts (three.js globe: scene, post, holds), site.ts, templates.ts, utils.ts
├── components/
│   ├── dashboard/           # Viewer, Sidebar, TopBar, the views, the summary strip and the three panels;
│   │                        #   derive*.ts hold every number they show (overview-types.ts); axis.ts,
│   │                        #   event-kinds.ts, legend.tsx, hint.tsx, chart-tooltip.tsx, mark-details.tsx;
│   │                        #   view-url.ts (?view=, each view's keys, run links), live-refresh.tsx,
│   │                        #   intro.tsx (GSAP, by data-motion); the Assessments view (assessments-*.ts(x)),
│   │                        #   Findings (findings-view/-list.tsx, finding-detail.tsx, filters.ts, filter-bar.tsx),
│   │                        #   Reports (reports-view.tsx, report-selection/-runs/-preview/-downloads/-file.tsx,
│   │                        #   use-file-download.ts: fetch then save, with a status line; derive-report.ts),
│   │                        #   run-cells.tsx (the one run row of Assessments and Reports), view-header.tsx,
│   │                        #   view-link.tsx and run-link.tsx (drill-downs), docs-search.tsx
│   ├── assistant/           # AssistantProvider (+ use-* hooks: open, asking, history, tab memory),
│   │                        #   AssistantStage + motion*.ts + use-globe*.ts (the transition and the globe),
│   │                        #   AssistantView, header, welcome, prompt cards, messages, cards/, composer,
│   │                        #   conversation menu, breath.ts, use-stick-to-bottom.ts + scroll-to-bottom.tsx,
│   │                        #   the composer's model chip and picker (model-chip.tsx, model-picker.tsx, the
│   │                        #   steps model-pick/-your-models/-providers/-credentials/-choose.tsx, the rules
│   │                        #   model-picker-rules.ts + model-name-rules.ts, use-models.ts, use-roving.ts,
│   │                        #   use-fit-above.ts)
│   ├── knowledge/           # KnowledgeView, FileTable / FileGrid, FileActions (Open, Remove), LayoutSwitch,
│   │                        #   UploadDialog, KindIcon, use-knowledge.ts, use-layout.ts
│   ├── ui/                  # Button, Badge, StatusBadge / SeverityBadge, IconButton, Checkbox, CopyButton,
│   │                        #   Pagination, ListDetail, EmptyNote (cva + cn; styles/ui.css)
│   └── docs-*.tsx           # the docs' group page, page frame, part, sidebar, search, "On this page", top bar,
│                            #   docs-headings.ts (what is being read); the rail: dashboard/sidebar.tsx
├── content/docs/            # the documentation pages, one file per group; commands.json is GENERATED from
│                            #   reconix/commands/builtin.py by scripts/export_commands.py (never edit it:
│                            #   tests/test_export_commands.py and tests/docs-nav.test.ts check it)
└── styles/                  # tokens.css (GENERATED from reconix/theme.py by scripts/export_tokens.py), then one
                             #   file per area, imported in this order from app/globals.css: frame (page and
                             #   scrolling), dashboard, motion, site, assistant, ui (shared controls),
                             #   findings, assessments, reports, knowledge, docs
public/globe/land.bin        # the globe's land dots (scripts/build-globe-points.mjs)
```

## Exports

The Reports view's **Download** row offers PDF, JSON and DOCX (the same three the TUI saves),
from `/api/assessments/<uid>/export?format=…`, and so does each row of the runs table. Each
button fetches the whole file, then saves it (`use-file-download.ts`, shared with the combined
report), so a refusal is shown, never saved as a file: the status line under the buttons (under
the table, naming the run) says "Downloaded …", offers **Retry** on a failure, and offers
**Download DOCX** when the PDF can't be printed. The PDF is printed by a Chrome/Chromium
on the dashboard machine (`RECONIX_CHROME` names one); without a browser the route says so and
links the Word document. Every format is a download, and no route may be framed. The DOCX is
written by `lib/report/docx/` (no dependency: a stored ZIP of the document and its styles, every
value XML-escaped, one run per value and a size cap). All formats come from the saved,
already-masked data; `lib/report/formats.ts` is the single list of formats.

With every run shown, the Reports view's **Combine runs** panel picks up to five saved runs,
previews them as one report (the same HTML the PDF prints, in a sandboxed frame: a preview, never
a download) and generates one PDF or one DOCX from
`/api/reports/combined?uids=a,b&format=pdf|docx|preview&evidence=1&low=1&appendix=1` (without a
printer the PDF answers 501 and the panel offers the DOCX; a Word document past `DOCX_MAX_MIB` of
text answers 413, on the single export too)
(`lib/report/combined/`). A finding with the same title, CWE and target in several runs counts
once, with each run as an occurrence; what a run lacks is listed under Limitations.

## Rules

- **Read-only for assessments.** No route writes, deletes or starts anything the TUI reads;
  decisions belong in the TUI. One exception: the AI Assistant writes **its own conversation files** and its saved models (`models.json`, `models.key`) in
  `~/.reconix/assistant` (and nothing else). The Security knowledge page adds and removes
  knowledge files, never itself: it starts the Python knowledge CLI (the same code as `/add-on`)
  for each change and for each original it opens (the knowledge folder is not assessment data). The assistant's route is also the one place saved
  data leaves the machine, and only to the model you chose (the model picker's test and
  fetch send no assessment data). The PDF exports (single and combined) start a headless Chrome on a
  temp file the server wrote (`lib/report/pdf.ts`), never on anything the request said.
- **One data source.** Pages read through `lib/data/store.ts` only; it accepts regular files
  named `<YYYYMMDD-HHMMSS-xxxx>_<id>.json` up to 5 MB that pass `AssessmentSchema`.
  Change `schema.ts` together with `reconix/store/snapshot.py`.
- **Access.** No roles: one local user. Every page and route but the sign-in page and route
  needs a session (the cookie `<issued>.<signature>`, 12 h; an old role-prefixed one no longer
  reads), and signed in everything is open (`proxy.ts`, and pages / handlers check again). Every
  change checks the page's Origin. The dashboard binds to 127.0.0.1 and refuses other Host
  headers. There is no terminal: nothing in the dashboard runs the TUI.
- **Text is text.** Saved values (targets, evidence, chat) and the model's replies are
  rendered by React as text (`MessageText` turns a small markdown subset into elements);
  never use `dangerouslySetInnerHTML`.
- **Colors** come only from `tokens.css`; add a token in `reconix/theme.py` (`WEB_TOKENS`)
  and re-run `scripts/export_tokens.py`. No stylesheet holds colour literals. Meanings come
  from `lib/status.ts` (teal = AI and progress, green = done, amber = waiting or to review,
  red = errors and blocked, slate = informational; severity on the TUI's scale).
- **Scrolling.** The dashboard and the docs (which share its frame) scroll natively. On the fixed desktop frame (≥1280×760) `.dash-content` is the one scroller,
  elsewhere the window; never `overflow: hidden` on the page to fix scrolling.
- **Numbers come from the saved run.** Every value on the dashboard is computed in
  `components/dashboard/derive*.ts` from `lib/data/adapt.ts`, and every number on an assistant
  card in `lib/assistant/cards.ts`; components hold no literal numbers, and nothing the snapshot
  doesn't record is shown (there is no "failed" state: the data has none).
- **Motion hooks.** The transition and the intro find the Overview's groups by
  `data-motion` (`top`, `hero`, `fade`, `right`, `bottom`), never by class names; the
  assistant view keeps `data-assistant-piece` on its header, conversation and composer, and
  the welcome's `data-globe-slot`.
- **Filters are client-side** over data the page already has (`components/dashboard/filters.ts`,
  `assessments-filters.ts`, `lib/paging.ts`; unit-tested, and anything unknown in the address
  is ignored or clamped); they never add a route or a request.
- **No inline scripts.** The intro's hide-before-animate state is CSS
  (`@media (scripting: enabled)`), so the nonce CSP needs no exceptions.
- **Reusable components** in `components/dashboard` (DashCard, Popover, …) and `components/ui`
  before new markup.
- **Severity colors** always sit next to the severity name (never color alone).
