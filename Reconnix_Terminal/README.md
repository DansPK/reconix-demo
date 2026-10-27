# Reconix — TUI Demo

An interactive, keyboard-first terminal UI for **Reconix**, the AI-powered
security-testing assistant. Built with [Textual](https://textual.textualize.io/)
+ Rich. Execution is **simulated** — no real scanning happens — but the process is
real: the target you type picks a template, the template builds the scope, plan,
approvals and findings, and a policy engine checks every request against the scope you
approved.

Flow: **Start → Template → Plan → Approval → Execution → Findings → Finding Detail →
Report**. A **web dashboard** (`web/`) shows the saved assessments (Overview, Assessments,
Findings, Reports and an AI Assistant, with the documentation under `/docs`); assessments
run and are decided here, in the TUI.

## Run it

Needs **Python 3.9+** and, for the web dashboard, **Node.js 20+** (with npm) and Git.

**Linux / macOS**

```bash
git clone https://github.com/SokpisethNhoeun/Reconnix_Terminal.git
cd Reconnix_Terminal
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e .
python -m reconix          # or: python run.py
```

**Windows 10 / 11** (PowerShell; use Windows Terminal for the TUI)

```powershell
git clone https://github.com/SokpisethNhoeun/Reconnix_Terminal.git
cd Reconnix_Terminal
py -m venv .venv               # or: python -m venv .venv
.venv\Scripts\Activate.ps1     # if scripts are blocked: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
python -m pip install -e .
python -m reconix
```

Tests (Textual Pilot, no terminal needed):

```bash
pip install -r requirements-dev.txt     # pytest + pytest-asyncio
pytest -q
```

## Model integration — quick start

Reconix also runs **real, AI-driven assessments**: configure LLM providers, switch model
mid-run with preserved context, and have an agent run real Kali tools through an MCP server.
Without a model configured, the scripted demo above still runs.

```bash
# 1. TUI deps (as above) + the backend pentest harness
source .venv/bin/activate
python -m pip install -e .
pip install -e backend            # installs the harness (adds litellm, mcp, pyyaml)

# 2. one .env at the repo root for the whole app
cp .env.example .env              # set LLM_BASE_URL / LLM_MODEL (the default "reconix" provider)
                                  # and KALI_MCP_URL / KALI_MCP_AUTH_TOKEN (your Kali MCP server)
                                  # the provider API key is entered in the TUI, never in .env

# 3. run
python -m reconix
```

Then, in the TUI:

```
/provider set reconix     # enter the API key → test → REACHABLE
/model reconix/<model>    # the top bar shows: llm: Reconix · <model> ●
```

- **Chat** in natural language — just type a question; the agent answers (scrolls back).
- **Assess a target** — type a target or `/assess http://<host>`: you go through the
  Template/scope frames, approve the scope, and the agent runs real tools via the Kali MCP
  server, streaming progress on the Execution screen; findings land in `/findings`.
- **Switch model mid-run** — `/model <provider>/<model>` anytime; conversation context,
  findings and approvals are preserved. Add more with `/provider` (OpenAI, Anthropic,
  DeepSeek, Ollama, or a custom OpenAI-compatible endpoint).

Real scans need a reachable **Kali MCP server** (`DansPK/kali-mcp-server`); set its URL/token
in `.env`. See `docs/FLEXIBLE_LLM_PLAN.md`, `docs/HARNESS_INTEGRATION_PLAN.md` and
`docs/AGENT_FLOW_PARITY_PLAN.md` for the design, and `backend/README.md` for the harness.

Web dashboard (Next.js, reads `~/.reconix/assessments`). Type `/web` in the TUI: the first
time it installs the dashboard's packages and starts it in the background (`npm run dev`,
output in `~/.reconix/web.log`), then your browser opens on it. A dashboard the TUI
started stops when you quit. To run it on its own (from the repository folder, with the
`.venv` above created: the Security knowledge page runs Python from it):

```bash
cd web && npm install && npm run dev    # prints a sign-in link; /web opens the same one
RECONIX_DATA_DIR=sample-data npm run dev   # or browse the bundled sample assessments
npm run dev -- --no-open                # don't open a browser
```

On Windows (PowerShell) the sample data is `$env:RECONIX_DATA_DIR = "sample-data"; npm run dev`.

The dashboard has no terminal of its own: run assessments and decide their gates in the TUI
(`python -m reconix`); what it saves shows up on the dashboard's pages
(`docs/WEB_NO_TERMINAL_BELL_LOGO_PLAN.md`).

> Requires Python 3.9+. For the intended look, use a terminal with a
> **JetBrains Mono** (or any Nerd/▮ box-drawing) font and a dark background.

## How an assessment runs

1. **Start** — type a target (a URL, an IPv4 address or range, a git repo or a local
   path) or press Enter on an empty prompt for the demo. Anything else gets a short
   answer and nothing starts. After your first line the logo makes way for the
   conversation: your line on top, then Reconix's answer or one spinner line while it
   works (`Ctrl+O` lists the steps it finished).
2. **Template** — `/template` lets you pick one of four templates (Web URL, Network, API,
   Source Code) and type its target; a typed target picks its own template unless it fits
   several (then the screen asks, with the AI's pick recommended). Reconix drafts a
   **scope manifest**, shown in plain words (what it will test, what it may do, what it
   will never touch, its tools): approve it, edit it (methods, excluded paths, ports,
   tools, time limit), or reject it (nothing is tested; a fresh assessment starts).
   On the API template, the **API template: base URL and spec** form opens on its own once
   the scope is drafted (Cancel to skip; **Attach / Replace / Remove** stay in the Scope menu
   until you approve). **API base URL** is prefilled from the draft; a different one is
   checked like a typed target and re-drafts the scope for it (your manifest edits stay; an
   attached spec whose servers are all on another host is removed, with a notice).
   **OpenAPI spec (optional)** is a `.json` / `.yaml` OpenAPI 3 or Swagger 2 file, or a URL on
   the API's own host: `https` (plain `http` only for localhost), one read of at most 5 MB, no
   redirects, a 10 s limit, audit-logged as `api_spec.fetched` with the host and path (never
   the query). Leave it empty to keep only the base URL (an attached spec stays). The spec is
   read, never run, never widens the scope, and fills the endpoint count, plan and methods. A redacted digest of the schema — each
   endpoint's parameters, request body, responses and security — is also kept in memory for
   the AI (the `/assess` agent and the chat see it as untrusted reference data); it is never
   saved, never in the snapshot the web reads, and never in a report.
3. **Plan** — every phase, the target login it may need, and each risky action with its
   exact request. **Run plan** starts testing; **Edit steps** changes where a risky
   action runs (see Approval).
4. **Execution** — the live run: each task queued, running, paused or done (no
   percentages: a backend can't know how far a scan has got), a spinner with what
   Reconix is on and for how long, and the live output (time · who · message). The
   output follows new lines while you're at the bottom; scroll up to read and it stays
   put until `End`. It pauses
   when a step needs you: the **target login** opens a secure form, and each **gated
   action** opens the Approval screen. `Ctrl+C` stops the run. The login comes from the
   scope's tools: OWASP ZAP needs a test account (email + password); Nuclei, Postman and
   ZAP API scan a session cookie; nmap, testssl.sh and the code scanners nothing. One
   login covers them all (a test account covers the cookie tools). If the target then
   asks for a one-time code, a second form asks for just the code. It is never stored.
5. **Approval** — MEDIUM: approve or reject. HIGH: approve, then double-check the exact
   request ("No, go back" is selected). Rejecting stops the assessment. **Edit params**
   changes where the action runs (a path, host:port or repository file) before you
   decide: the policy engine checks the new value, the exact request and its hash are
   rebuilt, and the risk stays the same.
6. **Findings / Detail** — filter, sort (severity or validation) and triage (open,
   fixed, accepted risk, false positive).
7. **Report** — export PDF, JSON or DOCX to `./reports/` (`/web` opens the web dashboard).

The run keeps playing while you move between screens; when it reaches a gate the app
opens the screen that decides it. Every assessment of the session is kept:
`/assessments` reopens one where it stands.

## Keys

The interaction follows Claude Code: questions are ↑/↓ menus, `/` opens
command suggestions, and `?` shows the keys for the screen you are on.

| Key | Action |
|-----|--------|
| `/` | command suggestions: inline above the Start prompt, a command bar elsewhere |
| `↑` / `↓` | move through menus, suggestions, lists and tables; prompt history on Start |
| `Enter` | confirm the highlighted choice, send the request, or run the command; on Execution, open what the run waits for |
| `Esc` | close a menu or dialog, clear the prompt, or go back (on Approval: decide later) |
| `Tab` | complete the highlighted command; on Plan, switch between menu and steps |
| `←` / `→` | previous / next screen in the flow |
| `1`…`9` | pick a numbered choice in the focused menu |
| `1`…`8` | jump to any screen when no menu has focus (`2` = Template) |
| `d` | approval details (scope limits, exact request, audit trail) |
| `PgUp` / `PgDn` | scroll a long dialog |
| `Ctrl+R` | search prompt history (on the Start prompt) |
| `Ctrl+O` | expand / collapse the steps Reconix finished, under its spinner line |
| `End` | Execution: jump to the newest line of the live output and follow it again |
| `Ctrl+C` | stop the run (on Execution, after a confirmation) |
| `f` / `s` / `t` | Findings: filter / cycle the sort (severity, validation) / triage |
| `[` / `]` | previous / next finding on Finding Detail (same filter and sort) |
| `c` | Findings / Finding Detail / Report: chat about this assessment (opens the Start prompt) |
| `p` `j` `w` | Report: export PDF / JSON / DOCX |
| `?` | shortcuts for the current screen (on Start: when the prompt is empty) |
| `Ctrl+Q` | quit |

The line under the top bar tracks the flow: `✓` done, `✕` stopped, `!` waiting for
you, `●` the current step. Options that aren't available are shown dimmed and can't be
picked.

## Commands

Type `/`, keep typing to filter, `↑`/`↓` to pick, `Tab` to complete, `Enter` to run.

| Command | Does |
|---------|------|
| `/help` | shortcuts for the current screen |
| `/new [target]` | start a new assessment, optionally on a target (alias `/start`) |
| `/template [id]` | the Template screen; with an id (`web_url`, `network`, `api`, `source`) straight to its target (alias `/templates`) |
| `/plan`, `/approval`, `/findings`, `/report` | open that screen |
| `/status` | live execution, once the plan runs (alias `/execution`) |
| `/finding [id]` | open a finding; without an id, pick one from a menu |
| `/export [format]` | export the report; without a format, pick one |
| `/summary` | the assessment summary (and open the saved report) |
| `/assessments` | list and reopen this session's assessments (alias `/list`) |
| `/audit` | activity log, audit trail and your feedback (aliases `/activity`, `/log`) |
| `/provider [set\|update\|test\|unset <id>]` | manage LLM providers; no argument opens a menu (alias `/providers`) |
| `/model [provider/model]` | pick the active LLM model; no argument opens a menu (alias `/models`) |
| `/assess <target>` | run a real assessment with the AI agent (needs a `/model`; alias `/agent`) |
| `/add-on [path]` | add reference files for the AI; no argument opens a menu (alias `/addon`) |
| `/web` | open the web dashboard (it starts it first if needed; alias `/dashboard`) |
| `/quit` | quit (alias `/exit`) |

`/scope` is now `/template`.

## LLM providers (flexible model integration)

Chat lines typed **during and after a run** go to a real LLM; everything else stays scripted. Set a
provider with `/provider`, test it, then `/model` to make one active — the top bar shows
`llm: <provider> · <model> ●`. You can switch provider or model mid-run; the run, findings
and approvals are unchanged, and the model never decides a gate. Reconix, Ollama and OpenAI
work for real; Anthropic, DeepSeek and a custom OpenAI-compatible endpoint are wired through
LiteLLM the same way. Cloud providers (OpenAI, Anthropic, DeepSeek) need **only an API key** —
their endpoint and models are built in; Ollama takes a model name, and the custom endpoint a
URL + model. Providers and chat history live in one SQLite file
(`~/.reconix/llm.db`) with API keys Fernet-encrypted (key in `~/.reconix/llm.key`, 0600).

Copy `.env.example` to `.env` and set the default model — this `LLM_*` block defines the
built-in `reconix` provider shared by the TUI and the harness agent (its API key is entered
in the TUI, never in `.env`):

```dotenv
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=your-model-id
# optional: LLM_TIMEOUT, LLM_DB, LLM_KEY_FILE
```

## Agent mode — real assessments (backend/ harness)

When a `/model` is active, `/assess <target>` (or just typing a target) hands the **whole
assessment** to the AI agent in `backend/` instead of the scripted demo. The agent plans,
runs real Kali tools through the MCP server, and analyzes findings; its progress streams
into the chat and `/audit` (a reasoning model's chain-of-thought shows muted as "thinking…").
The agent's LLM is Reconix's active `/model`, so you can switch
provider or model **mid-assessment** and its conversation context is preserved (one `Agent`
keeps its history; only the client is swapped). When the agent needs a login it pops a
secure-input modal (password/token/cookie masked); the login runs host-side so the raw
password never reaches the model. Configure the Kali MCP server and point the `LLM_*` block
at your model in `.env` (see `.env.example`); `backend/` must be installed
(`pip install -e backend`). Without a model or the harness, the scripted demo runs instead.

**What is enforced (agent mode).** Approving the scope authorizes the target (Reconix registers
it, not the model), and every tool call the agent makes is checked against that scope before it
runs: the target host, the tool set, the time limit, allowed methods and excluded paths (web
scopes) and ports (network scopes; a source-code scope refuses every network tool). A refused
call is not executed; the refusal goes back to the model, shows as a POLICY line in the activity
log, raises the blocked count and is audited. What is **not** enforced: the scripted flow's
per-action approval gates (MEDIUM: one decision; HIGH: the double check bound to the request
hash) do not apply to the agent's actions — it asks its own yes/no confirmations in the chat
instead, so read them. The tool set limits it only if you edit the tools down (the manifest
lists every scanner), a scanner's own traffic inside an allowed target is not checked request by
request, and a bare-host scan on a network scope is judged by host only. Login requests never
follow redirects. `/assess`, `/new`, opening another assessment and quitting cancel a running
turn; the run you leave is marked stopped.

With no active model (or if a call fails) the built-in reply is used, so the demo runs
offline.

## Knowledge add-ons (`/add-on`)

Give the AI reference material from your own documents. `/add-on` opens a menu (add a file,
remove one, remove all); `/add-on <path>` adds one straight away. Supported files are
`.txt .md .json .yaml .yml .docx .pdf` (at most 10 MB, no symlinks); PDFs use `pypdf` (at most
2,000 pages), Word files `python-docx` (at most 50 MB unzipped), and YAML anchors, aliases and
merge keys are refused. Each file is read once in the background, **cleaned and redacted at
ingest** (so a secret in the document, or in its file name, never reaches disk), split into
passages of at most 1,200 characters (at most 2,000; the notice says when a file was cut short),
and saved under `~/.reconix/knowledge` (`RECONIX_KNOWLEDGE_DIR`; the folder is `0700`, files
`0600`, atomic writes); at most 50 sources are kept. The files are only ever read — nothing in
them is run. If the index can't be read, `/add-on` offers only to remove everything.

**Originals are kept.** Besides the passages, each file's original bytes (as read, at most 10 MB,
never redacted) are saved as `<id>.orig`, Fernet-encrypted with a key of their own
(`~/.reconix/knowledge.key`, `RECONIX_KNOWLEDGE_KEY_FILE`; `0600`, created exclusively, refused
when group or others can read it). Only the passages are redacted and sent to a model. Each source
records `"source": "web" | "terminal"` and `"original": true | false` (an older source reads as
`terminal`, `false`); removing a source or all of them deletes the `.orig` files too.

The dashboard's upload, open and remove use the same code through a small command line:
`python -m reconix.knowledge add --file <path> --name <name> --source web|terminal`, `list`,
`original <id>` (the decrypted bytes on stdout) and `remove <id>`. It prints one JSON object
(`{"ok":true,…}`); exit 0 is ok, 2 is a refusal (`{"ok":false,"error":"…"}`, such as "Save it as
.docx first" for a `.doc` file) and 1 is an internal error.

When you ask a question, the passages that share your words are found with BM25 (at least two
matching terms, or the whole query when it is shorter; the best four, up to 4,000 characters)
and added to the context as **untrusted reference material**, never instructions. **Those
passages are sent to the active model with your question, local or remote**; adding a file while
a remote model is active says so. The terminal chat then shows a muted `Knowledge: a.md, b.pdf`
line under the reply; the `/assess` agent gets a read-only `search_knowledge` tool (allowed by
the scope guard, kept to the same 4,000 characters, logged only as a count); and the web AI
Assistant reads the same folder (it never writes it). With no active model, no knowledge is used.

## Safety model

The store is the authority; the screens only ask. Testing starts only after the scope
is approved **and** the plan is run. Each risky action waits for a human decision bound
to the exact request (`store.approve()` checks the command hash); HIGH risk also needs a
double check, the single-use token from `store.request_confirmation()`. Editing an
action (`store.edit_approval()`) is policy-checked, rebuilds the request and its hash,
and voids any open confirmation, so you approve exactly what is shown. The policy
engine checks every request against the approved scope and blocks the rest (agent mode:
each of the AI agent's tool calls too — target, tool set, methods, excluded paths, ports and
the time limit; the per-action approval gates above do not cover the agent, see Agent
mode). Target logins live in memory for the session only; one-time codes are never stored; evidence
is masked; saved copies for the web dashboard (`~/.reconix/assessments`, 0600) never
contain a secret. The web dashboard answers on 127.0.0.1 only, behind a sign-in link, and
runs or approves nothing: decisions stay in the TUI.

## Project layout

```
reconix-tui/
├── run.py                  # launcher
├── requirements*.txt, pyproject.toml
├── docs/                   # plans: CLASSIC_UI_PLAN (the classic-ui branch), LLM integration,
│                           #   the web dashboard (WEB_REDESIGN_V3_PLAN is the current one) …
├── scripts/                # export_tokens.py (web colors), export_commands.py (the docs'
│                           #   command reference), make_sample_data.py (web/sample-data)
├── web/                    # Next.js dashboard: read-only views, the AI Assistant, single and
│                           #   combined report exports, the docs, Security knowledge
├── tests/                  # pytest + Textual Pilot
└── reconix/
    ├── app.py              # ReconixApp: bindings and the command runner
    ├── shell/              # app behaviour: navigation, run_host (gates), actions, dialogs
    ├── flow/               # RunController (plays the run), gates → screens, phases
    ├── llm/                # flexible LLM: config, crypto, sqlite db, catalog, LiteLLM client, guardrail
    ├── commands/           # slash commands: registry + built-ins
    ├── models/             # dataclasses (Assessment, RunStep, ScopeManifest, Finding, …)
    ├── store/              # in-memory store — the only data the UI reads
    │   ├── run.py          # the run: start, advance, gates, stop
    │   ├── templates/      # web_url, network, api, source: scope, plan, findings, steps
    │   ├── scope.py, policy.py, approvals.py, vault.py
    │   ├── scope_view.py     # the scope manifest in plain words
    │   ├── findings.py, findings_view.py, retest.py
    │   ├── knowledge/      # /add-on files: extract, chunk, BM25 rank, the folder (web reads it)
    │   ├── plan.py, progress.py      # the Plan screen's rows, the flow line's states
    │   └── report*.py, snapshot.py, persist.py   # exports; saved copies for the web
    ├── theme.py            # color tokens (the stylesheet's $variables come from here)
    ├── reconix.tcss        # Textual stylesheet
    ├── browser.py          # open a URL / saved report without disturbing the TUI
    ├── web_server.py       # /web starts and stops the dashboard (npm run dev in web/)
    ├── widgets/            # session bar + flow line, menus, prompt, question, run log,
    │                       #   scope manifest view, spinner + activity line, finding cells
    └── screens/
        ├── start.py        # 01 Start (prompt)
        ├── template.py     # 02 Template + scope manifest (replaces scope.py)
        ├── plan.py         # 03 Test plan
        ├── approval.py     # 04 Approval gate
        ├── execution.py    # 05 Live execution
        ├── findings_list.py, finding_detail.py, report.py   # 06–08
        ├── forms/          # FormScreen: target login, scope edit, action params
        ├── choice.py       # ↑/↓ dialog: confirmations, details, pickers
        ├── command_bar.py  # `/` command bar
        └── help.py         # ? contextual shortcuts
```

## Wiring the real backend

Everything the UI shows comes from functions in `reconix/store/`. To connect the
Reconix backend, keep each store function's name and return type and replace its body
with an API call; `store.advance()` becomes the server's event stream and the
`RunController` stays the same. See `docs/LLM_INTEGRATION_PLAN.md`.
