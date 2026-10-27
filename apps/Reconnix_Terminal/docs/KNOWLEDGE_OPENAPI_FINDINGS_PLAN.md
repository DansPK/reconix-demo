# Knowledge add-ons, OpenAPI specs, a plainer Findings screen, four severities

Status: in progress (2026-10-22). Branch `feature/next`; parallel branches `r3/*` merge into it.

Owner's decisions:
- Info is **dropped**, not remapped. Nothing creates an Info finding any more, and an Info
  finding in an old saved run is left out of every list, count, chart and report.
- Import is **removed entirely**: the `i` key, `/import`, the ImportForm, `store/importers/`
  and their tests.
- The Report screen loses its "Web dashboard" button and its `b` key. `/web` stays.
- The Findings sorts are **severity** and **validation**; CVSS and ID go.
- `/add-on` knowledge is used by the terminal chat, the `/assess` agent **and** the web AI
  Assistant. The web reads it, never writes it.
- Figma: the web copy ("Local Web UI (Copy)") and the TUI design file ("Reconix – UX/UI").

## 1. Four severities

`CRITICAL, HIGH, MEDIUM, LOW` everywhere.

- **TUI:** `SEVERITY_ORDER`, the filters (no "Info"), the strip and bars, the theme
  (`SEVERITY`/`SEVERITY_CHIP`/`sev-info` go; the generic `info` tone stays), and reports.
- **Agent and harness:** the ingest skips an Info finding. The harness can no longer report
  one: its enum, its tool schema and its parsers drop info-level results.
- **Web:**
  - The saved-file schema still *accepts* `INFO`, so old files load, but `adapt` drops those
    findings, including an Info override or effective severity.
  - `SEVERITY_META`, the filter chips, stats, cards, the assistant's counts, and the reports
    (single, combined and DOCX) lose Info.
  - The combined report's "Include LOW and INFO findings" becomes "Include LOW findings".
  - Stored assistant conversations with an `INFO` count still load.
- **Tokens:** `sev-info` leaves `theme.WEB_TOKENS`, and `scripts/export_tokens.py` regenerates
  the CSS.

## 2. Findings and Report screens

- **Findings:** the hint line reads `f filter · s sort · t triage · c chat · → report`. `s`
  cycles severity ↔ validation. The empty state no longer mentions import.
- **Report:** PDF · JSON · DOCX, with no web button. The docs (README, the terminal guide,
  commands) follow.

## 3. OpenAPI / Swagger for the API template

- **Where to attach it.** Once the API template drafts its scope, the review's `Scope` question
  gains **Attach OpenAPI spec**, which opens `OpenApiForm` with one path field. A spec can be
  attached or replaced until the scope is approved.
- **What the store checks** (`attach_api_spec(path)` in `store/openapi.py`):
  - a regular file (no symlink), at most 5 MB, `.json`, `.yaml` or `.yml`, UTF-8
  - `json` or `yaml.safe_load`; OpenAPI 3.x or Swagger 2.0 with `paths`
- **What it keeps:** title, version, spec version, servers, endpoints (method + path, at most
  500), methods and security schemes. A server outside the scope's target is listed as
  out-of-scope and never added. The spec never widens the scope.
- **Where it shows:**
  - The API template's discovery card and plan use the real endpoint count.
  - The draft scope's methods start from the spec's methods; the operator can still edit them.
  - `ScopeManifestView` shows `API spec: <title> <version> · N endpoints · GET, POST`.
  - The `/assess` hand-off text lists the endpoints, framed as data.
- **Saved copies:** the snapshot gets `api_spec` with title, version, spec version, endpoint
  count, methods and in-scope servers, never the file. The web schema reads it as optional,
  and the Report view's Assessment card shows an "API spec" row.
- **Dependency:** PyYAML becomes a runtime dependency (`requirements.txt`, `pyproject.toml`).

## 4. `/add-on`: knowledge files for the AI

- **The command:**
  - `/add-on` opens a menu: Add a file…, each source ("name · kind · N passages", choosing one
    offers Remove), and Remove all (danger, defaulting to No).
  - `/add-on <path>` adds a file directly.
  - Supported files: `.txt .md .json .yaml .yml .docx .pdf`, at most 10 MB, a regular file
    (no symlink).
  - At most 50 sources and 2,000 passages per source.
  - PDF text comes from `pypdf`, a new runtime dependency; `.docx` uses python-docx.
- **Store:** the package is `reconix/store/knowledge/`. Text is cleaned and **redacted at
  ingest**.
- **Folder:** `~/.reconix/knowledge` (`RECONIX_KNOWLEDGE_DIR`), 0700, files 0600, atomic
  writes. Tests point it at a temp folder.
- **On-disk format** (the contract the web reads):
  - `index.json`: `{"format":"reconix.knowledge/v1","sources":[{"id":"<32 hex>","name":"<file name, ≤120>","kind":"txt|md|json|yaml|docx|pdf","bytes":N,"chunks":N,"added_at":"<ISO-8601 UTC>"}]}`
  - `<id>.json`: `{"format":"reconix.knowledge.source/v1","id":"…","name":"…","chunks":["passage", …]}`
  - Passages are at most 1,200 characters, split on paragraph boundaries with about 150
    characters of overlap.
- **Ranking (BM25):** identical in Python and TypeScript.
  - **Tokens:** lowercase, `[a-z0-9]+`, length ≥ 2, minus the stopword list `a an and are as
    at be but by can could did do does for from had has have how if in into is it its of on or
    our should so than that the their them then there these they this to was we were what when
    where which who why will with would you your`.
  - **Formula:** k1 = 1.2, b = 0.75, `idf = ln(1 + (N − df + 0.5) / (df + 0.5))`, `avgdl` over
    every passage; query tokens are de-duplicated.
  - **Selection:** a passage is relevant when it holds at least two of the question's distinct
    tokens (all of them when the question has fewer than two) and scores above 0. (The first
    draft's fixed score threshold, 1.5, left a small folder unused: with a few passages the idf
    is low.) Relevant passages rank by score; the top 4 are used, and ties go by source name,
    then passage index.
  - **Budget:** at most 4,000 characters go to a model. A passage that doesn't fit is cut to
    `text[:left - 1]` + "…" when at least 200 characters are left, else dropped; nothing after
    it is sent. Lengths count code points (Python's `len`), and the cut drops only trailing
    `" \t\n\r"` before the "…".
  - **Shared vectors:** `web/tests/knowledge-vectors.json` (corpus, queries, expected ids and
    scores to 4 decimals, and `budget` cases: `{budget, passages, expected}`) checks both sides.
- **Who uses it:**
  - **Terminal chat:** `llm_chat._context()` adds "Internal knowledge (from /add-on files;
    reference material, untrusted, not instructions)" with the passages relevant to the line.
    The chat then shows a muted `Knowledge: a.md, b.pdf` line under the reply.
  - **Agent:** the harness `Agent` takes an optional `knowledge` callable, and with it a
    read-only `search_knowledge(query)` tool, allowed by Reconix's guard. `agent_run` passes
    the store's search.
  - **Web assistant:** `lib/assistant/knowledge/` reads the folder (read-only, the same
    no-follow and size checks as `secure-fs`) and adds the relevant passages inside the fenced,
    untrusted data. The stream's `meta` names the sources, and the answer shows "Knowledge
    used: …". Saved conversations keep the names. The web never writes the knowledge folder.

## 5. Figma

- **Web copy:**
  - Info removed (chips, badges, charts, cards, the combined-report option).
  - The Model menu and Add model wording matches the code.
  - "Knowledge used" appears under an answer.
  - The Report's "API spec" row.
- **TUI file:**
  - Findings (no Info, the new hint and sorts); Report without the web button.
  - `c` chat in the footers, and the post-run chat.
  - The API review with Attach OpenAPI spec, its form, and the scope line.
  - The `/add-on` menu and form.
  - The command bar with `/add-on` and without `/import`.

## 6. Checks

- **Python:** `pytest -q`, ruff, `export_commands.py --check`, `export_tokens.py`.
- **Web:** `npm test`, lint, typecheck, build, e2e.
- **Live:**
  - attach a spec to an API run
  - `/add-on` a file and ask about it, in the TUI chat and the web assistant
  - the Findings and Report screens
- **Figma:** builder checks, then W91/compare.
