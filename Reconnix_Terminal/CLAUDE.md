# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Reconix TUI (classic UI)

Keyboard-first terminal UI for **Reconix**, an AI-powered security-testing
assistant. Built with **Textual 8.x + Rich**, Python ≥ 3.9. The app runs on an
**in-memory store** (`reconix/store/`) that plays a realistic, simulated assessment
and is the seam for the Reconix backend. A Next.js dashboard lives in `web/` (opened with
`/web`): the globe "Assessment Operations Center" with read-only views of the saved runs and
the AI Assistant. Assessments run and are decided in this TUI only (the web has no terminal).

Flow: **Start → Template → Plan → Approval → Execution → Findings → Finding Detail → Report**.
Branch `classic-ui`: the original full-screen UI (53ac746) running version 1's process —
see `docs/CLASSIC_UI_PLAN.md`.

## Commands

```bash
source .venv/bin/activate
pip install -r requirements.txt
python -m reconix                 # run the app (or: python run.py / reconix)
pip install -r requirements-dev.txt   # pytest + pytest-asyncio (python-docx is a runtime dep)
pytest -q                         # store tests + Textual Pilot tests (~70 s)
pytest -q tests/test_store_run.py             # one file
pytest -q tests/test_gates_ui.py::test_name   # one test   (or: pytest -q -k approval)
python -m compileall -q reconix   # quick syntax check
uvx ruff check --line-length 100 --select E,F,W,B reconix tests   # lint (no config yet;
                                  #   0 findings today, keep it that way)
python scripts/make_sample_data.py    # regenerate web/sample-data after a process change
python scripts/export_tokens.py       # theme.WEB_TOKENS → web/src/styles/tokens.css
python scripts/export_commands.py     # COMMANDS → web/src/content/docs/commands.json (the docs'
                                      #   command reference); `--check` exits 1 when it is stale

cd web && npm run dev             # web dashboard; RECONIX_DATA_DIR=sample-data for demo data,
                                  #   `-- --no-open` to not open a browser
npm test                          # vitest
npm run lint && npm run typecheck # typecheck needs `npx next typegen` (or a build) first
npm run build && npm run e2e      # Playwright on sample-data (needs a Chromium)
```

Tests: `asyncio_mode = "auto"`, so `async def test_…(app)` needs no marker; Pilot tests use
`app.run_test(size=SIZE)` (`SIZE` from `tests/support.py`). `tests/conftest.py` resets the store around every test, plays the run instantly
(`RunController.SPEED = 0`), points reports / saved copies / the web link at temp, and
stubs `browser.open_url/open_path` (the `opened` fixture records them — never launch a
real browser). `tests/support.py`: `run_to(gate)` / `decide(gate)` / `play_until_gate()`
drive the store; `run_ui_to(app, pilot, gate)` / `pass_gate()` drive the screens;
`settle(pilot)` lets screen switches and dialogs land (dialogs open on the app's next turn).
`store.DEMO_REQUEST` (a URL) skips the template gate; pass `ASK_REQUEST` to stop at it.
`TEST_PASSWORD` must never show up in output, logs, reports or saved copies. The
`web_launches` fixture stubs `web_server` (start/install/stop): no test starts a real dashboard.

## Architecture

```
reconix/
├── app.py            # ReconixApp: bindings, run_command_line / run_command (mixes in shell/)
├── shell/            # app behaviour, one concern per module
│   ├── navigation.py # FLOW, goto / go_next / go_prev, reload_screen, open_dialog
│   ├── run_host.py   # hosts RunController; refresh_view, open_gate (deferral), resume_run
│   ├── actions.py    # submit_request, template/scope/plan decisions, new / switch assessment
│   ├── dialogs.py    # assessments, triage, export, audit, summary
│   ├── llm.py        # /provider and /model: menus, ProviderForm, tests in a worker
│   ├── agent.py      # agent mode: /assess drives the backend harness, streams events
│   └── web.py        # /web: open the dashboard, starting it in the background if needed
├── flow/             # RunController (plays store steps), gates.py (gate → screen), phases
├── knowledge/        # `python -m reconix.knowledge` (add/list/original/remove): the web's /add-on
├── llm/              # flexible LLM (no UI, no store.lists): config, crypto (Fernet),
│                     #   db (sqlite3), catalog (6 providers), client (LiteLLM), guardrail
├── commands/         # registry.py (Command: choices, ask, empty) + builtin.py (COMMANDS)
├── models/           # dataclasses: Assessment, RunState/RunStep/PlanRow, ScopeManifest, …
├── store/            # the only backend seam; public functions in store/__init__.py
│   ├── run.py        # start, advance (gates), run_plan, reject_scope, stop_run, phases
│   ├── templates/    # per-template scope, plan, approvals, findings, script (base.py builds)
│   ├── scope.py / policy.py / approvals.py / vault.py    # enforcement lives here
│   ├── providers.py / llm_chat.py    # the LLM seam: configure/test/pick a model (providers.py);
│   │                                 #   turn a chat line into a model reply (llm_chat.py)
│   ├── agent_run.py  # the harness seam: drive backend/ Agent.chat; switch_model keeps history
│   ├── openapi.py    # an OpenAPI file attached to the API scope draft (read, never widens it)
│   ├── plan.py / progress.py / findings_view.py          # what the classic screens show
│   └── report*.py / snapshot.py / persist.py             # exports; saved copies for web/
├── theme.py          # color tokens; CSS_TOKENS feed the stylesheet's $variables
├── reconix.tcss      # Textual stylesheet (no hex values: $variables only)
├── browser.py        # open_url / open_path, detached and silent
├── web_server.py     # start / stop `npm run dev` in web/ quietly (log: ~/.reconix/web.log)
├── widgets/          # SessionBar/FlowProgress, ChoiceMenu, PromptBox, Question, RunLog,
│                     #   ScopeManifestView, Spinner/ActivityStatus,
│                     #   finding cells (widgets/findings.py)
└── screens/
    ├── base.py       # ReconixScreen: chrome + body + footer; view_state / refresh_live
    ├── <frame>.py    # one file per flow frame (template.py replaced scope.py)
    ├── forms/        # FormScreen (+ LoginForm, ScopeEditForm, ApprovalEditForm, OpenApiForm)
    ├── choice.py     # ChoiceScreen dialog (+ details_body())
    ├── command_bar.py, help.py
```

How the pieces connect:

- **Store state** is module-level lists in `store/lists.py` (`ASSESSMENTS`, `CURRENT`,
  session-wide `EVENTS`/history/feedback); only store modules import it. Importing
  `reconix.store` loads the demo data; `store.reset` reloads it.
- **A run is a list of `RunStep`s.** Choosing a template calls its module's
  `build_scope(parsed)` and `build_run(assessment) -> RunBundle`; `templates/base.py`
  (`RunProfile` → `build_script()`) weaves each template's content into the same phased
  script and gates, so all four templates behave alike. A new template registers in
  `templates/__init__.py` (`MODULES`, `CATALOG_ORDER`).
- **`RunController`** (`flow/controller.py`) holds no data: it `peek()`s the next step,
  waits `step.pause × SPEED`, calls `store.advance()`, then asks its host to redraw or
  open a gate. With the backend wired, `advance()` becomes the server's event stream.
- **The LLM seam** (`store/providers.py`, `store/llm_chat.py` over `reconix/llm/`): a chat
  line typed *during a run* goes to the active model (LiteLLM), with a fixed `SYSTEM_PROMPT`,
  the assessment state as context and the full history — all redacted. The model proposes
  narrative only; it has no tools and no path to a decision function. Providers, the active
  model and chat history live in one Fernet-encrypted SQLite file (`~/.reconix/llm.db`); the
  key lives in `~/.reconix/llm.key` (0600) and never enters env/logs/snapshots. With no
  active model, or on any `LLMError`, `run.llm_answer` falls back to the built-in reply, so
  the offline demo and existing tests keep working.
- **The harness seam** (`store/agent_run.py` over `backend/harness/`): when a `/model` is
  active, `/assess <target>` hands the whole assessment to the harness `Agent` (plan → real
  Kali-MCP scans → analyze), run in a worker; its streamed events render into the chat and
  activity log. The agent's LLM is Reconix's active provider (LiteLLM), set before each turn;
  `switch_model()` swaps only the client and keeps `Agent.history`, so a mid-assessment model
  switch preserves context. `/provider` + `/model` are the whole app's LLM control plane (the
  unified `LLM_*` env seeds the default `reconix` provider). Without a model/harness, the
  scripted demo runs — so the existing tests and offline demo are unaffected.
- **Saved copies for `web/`**: `persist.autosave` writes `snapshot()` (secrets removed) to
  `~/.reconix/assessments/` (`RECONIX_DATA_DIR`). The dashboard validates those files with
  `web/src/lib/data/schema.ts`: change it together with `store/snapshot.py`, then rerun
  `make_sample_data.py`.

Key invariants:

- **The store decides; screens ask.** Every decision goes through a store function that
  validates it and raises `StoreValidationError` (shown with `markup=False`). Screens never
  touch `store.lists` and never hold data literals. Getters return copies.
- **The run is hosted by the app** (`shell/run_host.py`), not a screen, so it plays while
  you browse. After each step the app calls `refresh_view()` on the top flow screen. A
  screen whose layout depends on the run returns that state from `view_state()`; a change
  rebuilds the screen (`app.reload_screen()`), or marks it stale if a dialog covers it.
  Small per-step updates go in `refresh_live()`.
- **Gates route to screens** (`flow/gates.py`): template + scope → Template, plan → Plan,
  approval:* → Approval, account and code → the LoginForm over the current screen. A gate that
  arrives while a dialog is open waits for it to close (`flow_screen_resumed`). After a
  decision, call `app.resume_run()` or `app.gate_decided(screen)`.
- **The app opens its dialogs with `app.open_dialog(dialog, callback)`**, never
  `push_screen` with a callback: Textual returns a result to whatever was handling a
  message at push time, and a flow screen may have been replaced since (the result is
  then lost). Screens may push their own dialogs while they stay on screen.
- **Navigation goes through the app**: `goto(name)`, `go_next()`, `go_prev()`. Flow order
  lives only in `FLOW` (`shell/navigation.py`). Execution opens only after the plan has run
  (`can_enter_execution`); ←/→ step over it until then. `_show` closes dialogs before it
  switches, so never call `goto()` from inside a modal anyway — dismiss and act in the callback.
  A new flow screen goes in `FLOW`, `screens/__init__.py`, the `1…8` bindings, `help.py`
  and the README.
- **Every flow screen subclasses `ReconixScreen`** and sets `flow_name`, `mode_name`,
  optionally `scroll = False`, and implements `compose_body()`.
- **Never put user, tool or scope text into markup.** Build `rich.text.Text` — including
  `border_title` / `border_subtitle` and `Label`s (Textual parses plain strings as markup).
- **Human-in-the-loop questions use the `Question` widget** (chip, numbered choices with a
  description, `(Recommended)`, "Type something." → `store.add_feedback`, "Chat about this"
  → `app.open_chat`). Handle `ChoiceMenu.Chosen`; add `Binding("enter", "choose", show=False)`.
  Pop-ups use `ChoiceScreen`; risky ones (`danger=True`) are unnumbered and default to the
  safe choice. The Approval menu highlights "View details" first so a stray Enter is harmless.
- **Text input pop-ups use `FormScreen`** (`screens/forms/`): fields, an error line, Submit /
  Cancel. `submit()` calls the store; a raised `StoreValidationError` keeps the form open.
  Secret fields use `SecretInput`; LoginForm wraps them in `Secret` and clears on close.
- **No dead ends.** Unavailable options are `Choice(..., disabled=True)` / disabled buttons.
- **Findings are keyed by `fid`** (`app.selected_finding`, table row keys);
  `store.find_findings(filter, sort)` returns findings; view state lives on the app.
- **Prompts are `PromptBox`**; slash commands live in `reconix/commands/` (handlers call app
  methods). A `Command` with `ask=False` uses its choices only as suggestions. The `/` app
  binding stays non-priority. A typed local path (`/home/me/app`) is a target, not a command.
- **Colors come only from tokens** (`theme.*` in Rich, `$vars` in TCSS, fed from
  `theme.CSS_TOKENS`). Add a token in `theme.py` only. Web colors come from
  `theme.WEB_TOKENS` through `scripts/export_tokens.py`; never edit the generated `tokens.css`.
- **Repeated UI becomes a widget** in `reconix/widgets/`.
- **Packages are listed explicitly** in `pyproject.toml` (`[tool.setuptools] packages`):
  a new subpackage must be added there or the installed `reconix` command won't find it.

## Web dashboard (`web/`)

Next.js 16 / React 19 with GSAP and a three.js globe (the UI came from
the reconix-web-ui site, see `docs/WEB_GLOBE_UI_PLAN.md`; the v2 redesign in
`docs/WEB_REDESIGN_V2_PLAN.md`; v3 — Assessments, paging, the combined report, the docs — in
`docs/WEB_REDESIGN_V3_PLAN.md`, §5 its status). `/` is one viewer page whose views (Overview,
Assessments, Findings, Reports, AI Assistant; Security knowledge from the assistant's header)
switch in-page via `?view=` (no Audit log view: the audit data stays in the saved files and the
TUI; no Terminal view, `/terminal` or `/api/terminal/*`: removed with `reconix/webterm`, see
`docs/WEB_NO_TERMINAL_BELL_LOGO_PLAN.md`). The sidebar has no logo (the views, Documentation at
the bottom) and the top bar no bell (live-refresh pill, assessment switcher, chips, docs
search); each view's own address
keys and every run link live in `components/dashboard/view-url.ts` (`VIEW_FILTERS`, `runHref`),
and `viewer.tsx` marks each pane `data-view-pane` and sets `html[data-hydrated]` once interactive
(the e2e hook). With no `?uid=` the Overview totals every saved run
(`components/dashboard/derive-overall.ts`), with one it shows that run (`derive.ts`); both
produce `OverviewCards` (`overview-types.ts`: the summary strip, Findings by Severity, the
Activity and Execution Timelines) over `lib/data/adapt.ts`, and every number comes from them.
Assessments, Findings and the Report view's runs show ten rows a page (`lib/paging.ts`,
`?page=`, `ui/pagination.tsx`); Findings keeps its filters, page and open finding in the
address, its list pane is its own scroller on the fixed desktop frame and on phones the list
and the detail take turns (`ui/list-detail.tsx`). The page re-reads the files every
`RECONIX_LIVE_REFRESH_MS` (10 s; 0 = off, as the e2e server sets). `/docs` is the
documentation, inside the dashboard's own frame (`app/docs/layout.tsx`: the same `Sidebar`, whose
views link back to `/?view=…` and whose Documentation item is marked (no Settings item), a
`DocsTopBar` with no link or button, the `.dash-content` scroller; no separate site chrome), read
in place (`docs/WEB_DOCS_INLINE_PLAN.md`): one page per group, `/docs/<group>` (`/docs` itself
shows Getting started), showing all of the group's pages as parts anchored `#<page>` (sections
`#<page>-<section>`, `withPage`); nothing in it links off the page but the docs sidebar's groups,
another part is named in words (`DocRef`), and the search looks through the group shown and jumps
within the page. `lib/docs-nav.ts` (`DOCS_NAV`: groups → pages, each `/docs/<group>#<page>`;
`DOCS_ROUTES`: `/docs` and the group pages; the `DOCS` link map components import instead of
literals) over `content/docs/`; old addresses, every page's own `/docs/<group>/<page>` included,
redirect (308) to their anchors through `lib/docs-redirects.ts` in `next.config.ts`; the command
reference `content/docs/commands.json`
is generated by `scripts/export_commands.py` from `reconix/commands/builtin.py` and checked by
`tests/test_export_commands.py` and `web/tests/docs-nav.test.ts`, so never edit it by hand.
Dark only; colours come from `theme.WEB_TOKENS` through
`scripts/export_tokens.py` (meanings and the TUI's severity scale: `web/src/lib/status.ts` with
`StatusBadge` / `SeverityBadge`, never colour alone). Styles are one file per area in
`web/src/styles/`, imported in `app/globals.css`'s order. The transition and intro find the
Overview by `data-motion` (`top|hero|fade|right|bottom`), never by class names. The dashboard
and the docs scroll natively: on the fixed desktop frame `.dash-content` is the one scroller, elsewhere the
window. The **AI Assistant** (`?view=assistant`, `components/assistant/`) opens from the Ask bar
and its sidebar tab with a ≈1.6 s GSAP transition (`MOTION` in `motion.ts`) that carries the one
WebGL globe (never mount a second) behind the welcome; `POST /api/assistant` (signed in) asks
the OpenAI-compatible model chosen with the composer's model chip (only models added there with
**+ Model**, saved in `models.json`/`models.key` in its folder: the web reads no `LLM_BASE_URL` /
`LLM_MODEL` / `LLM_API_KEY`; cloud and remote addresses work by default, the picker and the
chip saying the data goes there; the e2e seeds its stand-in as a saved provider,
`e2e/models.ts`), with a context the server builds from the saved files
(`lib/assistant/context.ts`: no evidence, every value cleaned, framed as untrusted data) and
questions masked by `lib/assistant/redact.ts` (a port of `store/redact.py`: change both, the
vectors in `web/tests/redact-vectors.json` check both), streams NDJSON frames with cards the
server builds from the saved data (`lib/assistant/cards.ts`; the model never supplies numbers,
and nothing is run or approved from the chat), and keeps conversations on disk
(`lib/assistant/history-store.ts`, `~/.reconix/assistant`, 0700/0600, 30-day retention).
It also reads, never writes, the knowledge index and passages the TUI's `/add-on` keeps in `~/.reconix/knowledge`
(originals are kept encrypted as `<id>.orig` with `~/.reconix/knowledge.key`; uploads, opens and
removals go through `python -m reconix.knowledge`, `reconix/knowledge/`; `lib/assistant/knowledge/`: no-follow, owner and size checks, the TUI's BM25), putting the
passages relevant to the masked question inside the fence framed as untrusted reference material
and naming their files in `meta` ("Knowledge used: …").
The model is chosen with the **model chip** in the assistant's composer (`model-chip.tsx` opens
`model-picker.tsx` upward: "Model", your saved models with **+ Model** (`model-list.tsx`), and
"Set the provider" (`model-provider-form.tsx`: provider, base URL, API key, fetched or typed
model, Add model); the header has no model control; `/api/assistant/models…`,
`lib/assistant/models/`; every preset usable, cloud included): providers and
the active choice live in `models.json` beside the conversations, API keys AES-256-GCM-sealed
with `models.key` (0600) and never sent to the browser; every model passes `config.ts`'s
`checkModel`, and while nothing is chosen no model answers (there is no Environment model).
Exports: a report is saved as PDF, JSON or DOCX,
in the TUI and the web alike (the report HTML is only the PDF's source and the combined preview,
never a download): `GET /api/assessments/<uid>/export?format=pdf|json|docx`
(`lib/report/formats.ts`) and `GET /api/reports/combined?uids=a,b&format=preview|pdf|docx` (signed in;
1–5 saved runs combined in memory from the saved, already-redacted files, `lib/report/combined/`,
the query validated first; the preview inline, the PDF printed by the same headless Chrome as the
single export, 501 with the DOCX link without one; the Word files come from `lib/report/docx/`).
**Security knowledge** (`?view=knowledge`, `components/knowledge/`) opens from the assistant
header's Security knowledge button (no sidebar item; "← AI Assistant" goes back): the knowledge
files as a table or a grid (remembered per browser), a search over names, Upload (one
`.docx .pdf .txt .md .json .yaml .yml` file ≤ 10 MB; a `.doc` is told to become a `.docx`), Open
(the kept original: inline in a `sandbox; default-src 'none'` policy for PDF and text, a download
for DOCX) and Remove (asked first). `GET /api/knowledge` reads the index itself
(`lib/assistant/knowledge/read.ts`, never a path); every change goes through the same Python code
as `/add-on`: `lib/knowledge/cli.ts` runs `python -m reconix.knowledge add|original|remove`
(the dashboard's Python, as `serve.mjs` finds it; fixed arguments, no shell, a minimal env with
no `LLM_*`, 60 s), an upload first copied to a private temp file (0600 in a 0700 folder) that is
always deleted, one upload at a time and ten a minute (`docs/WEB_KNOWLEDGE_PAGE_AND_MODELS_PLAN.md`).
**Read-only for assessments**: no route writes or deletes anything the TUI reads; the only
writes are the assistant's own conversation and model files and the knowledge files the Security
knowledge page adds or removes (through that CLI only; the knowledge folder is not assessment
data), and the only things started are the knowledge CLI and, for both PDF routes, a headless
Chrome that prints a temp file the server wrote (`lib/report/pdf.ts`, `RECONIX_CHROME`; never
anything the request said). The knowledge CLI's stand-in (`RECONIX_KNOWLEDGE_CLI`,
`web/e2e/knowledge-cli-stub.mjs`: the same contract over a temp folder) is honoured only with
`RECONIX_KNOWLEDGE_CLI_TEST=1` (tests only).
Read `web/CLAUDE.md` and `web/README.md` (Rules) before changing it. This Next.js version
differs from older ones, so check `web/node_modules/next/dist/docs/` before writing code.
There are no roles (one local user, `docs/WEB_NO_ROLES_AND_WORKFLOW_PARITY_PLAN.md` §1): every
page and route but the sign-in page and route needs a session (`<issued>.<signature>`; an old
role-prefixed cookie no longer reads), and signed in everything is open (`proxy.ts`, and the
pages / handlers check again; guarded pages read the cookies first so none is prerendered). The
dashboard binds to 127.0.0.1, refuses other Host headers and checks every change's Origin; the
sign-in link is printed only to a TTY, never to `~/.reconix/web.log`.

## Project rules (applied to this TUI)

1. **No single-file code.** One screen per file, one concern per module (see `shell/`).
2. **Clean folder structure.** Follow the layout above; keep `__init__.py` exports current.
3. **Validate on the backend.** The store is the security boundary here; the UI may
   pre-check for UX (e.g. the code's 6 digits) but must show and respect the store's verdict.
4. **Protect actions by role.** Gated actions go through the approval gate; when auth is
   wired, hide or disable what the role can't do and treat 401/403 as final.
5. **Reusable components.** Widgets, `FormScreen`, `ChoiceScreen`, theme helpers.
6. **Plan before big features.** Write a short plan in `docs/` first.

## Security and safety context

Authorized security testing only. Demo data uses reserved example domains and fake,
masked evidence. Never run real scanners from the TUI; execution belongs to the backend,
behind scope checks and human approval. Do not weaken the gates: testing starts only after
the scope is approved and the plan is run; HIGH-risk actions need a double check, the
single-use token from `request_confirmation()` and the matching command hash
(`approve()` enforces both; no typed reason, by the owner's decision); the confirmation
dialog defaults to "No, go back". "Edit params" / "Edit steps" change only where an
undecided action runs, through `edit_approval()` (policy-checked, hash rebuilt, open
tokens voided; risk and method never change). The target login comes from the approved tools
(`store/tools.py`); a one-time code is its own step (`GATE_CODE`) right after the
password, validated and never stored; secrets never reach chat, logs, reports or the
saved copies (`snapshot.py` + `redact.py`).

## Team: subagents and skills

Project subagents live in `.claude/agents/` and skills in `.claude/skills/`.

| Subagent | Use it for |
|----------|-----------|
| `tui-engineer` | Building or changing screens, widgets, bindings, TCSS layout |
| `backend-integrator` | Replacing store bodies with backend calls |
| `security-reviewer` | Scope enforcement, approval gate, role checks, secret handling |
| `qa-tester` | Writing and running Textual `Pilot` tests |
| `code-reviewer` | Final review against the rules above |

| Skill | Use it for |
|-------|-----------|
| `add-screen` | Checklist to add a flow screen |
| `add-widget` | Extracting or creating a reusable widget |
| `wire-backend` | Moving one data source to a real backend endpoint |
| `theme-tokens` | Adding or changing colors |
| `write-tui-test` | Textual tests with `run_test()` and `Pilot` |

## Style

- Module docstring on every file (screens start with `"""Frame NN — <name>."""`).
- Type hints on public methods; stay 3.9-compatible (`Optional[X]`, not `X | None`).
- Section comments use the existing `# --- name ----` style; lines ≤ 100 characters.
