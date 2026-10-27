# Security knowledge page, and models without the env

Status: in progress (2026-10-22). Branch `feature/next-update`; cloud allowed by default (owner,
2026-10-22; branch `r7/cloud-default`: no `LLM_ALLOW_REMOTE`, the remote warnings stay). Follows
`WEB_COMPOSER_MODEL_PICKER_PLAN.md` (the chip stays) and `KNOWLEDGE_OPENAPI_FINDINGS_PLAN.md` §4 (the
`/add-on` store). Code and Figma change together.

## Owner's decisions

- **No env model.**
  - The web assistant uses only models added with **+ Model**.
  - `LLM_BASE_URL`, `LLM_MODEL` and `LLM_API_KEY` are no longer read by the web (they leave the
    docs, the "Environment" row goes, and the e2e seeds its stand-in model as a saved provider).
  - ~~`LLM_ALLOW_REMOTE` stays as the server's switch for cloud providers, still off by default.~~
    Superseded (owner, 2026-10-22): **cloud allowed by default.** There is no switch: cloud
    providers and any remote address work for operators; the warnings that the data leaves the
    machine (the form's "<Provider> runs at <host>: …", the Base URL's "Off this machine: …",
    the chip's remote tooltip) stay.
- **The model popup.**
  - Clicking the chip shows only **your models**: click one to use it (✓ on the active one).
    Each row has a remove action (confirm first).
  - A **+ Model** button opens a second popup, **Set the provider**, with:
    - Provider (select, the presets in order, every one usable; it starts on the first local one)
    - Base URL (Custom and local only)
    - API key (password, never prefilled)
    - Model: a select filled by fetching the provider's list, or typed
    - Cancel / **Add model**
  - Add model saves the provider (or adds the model to an already saved one) and uses it.
  - Server checks unchanged: the routes, Origin, role, rate limits, address rules and encrypted
    keys.
- **Security knowledge page.**
  - A **Security knowledge** button on the AI Assistant opens a new dashboard view
    (`?view=knowledge`, operators only; no sidebar item), with "← AI Assistant" back.
  - It lists the knowledge documents: **Name**, **Source** ("Web upload" or "Terminal (/add-on)",
    with the type and size; never a path) and **Uploaded** (time).
  - It has a **table/grid** switch (the choice is remembered per browser) and a **search** over
    names.
  - **Upload** accepts `.docx .pdf .txt .md .json .yaml .yml`, up to 10 MB. A `.doc` file is
    refused with "Save it as .docx first".
  - **Open** shows the original: PDF, TXT, MD and JSON in the browser, DOCX as a download.
  - **Remove** asks for confirmation first.
  - Viewers don't see the button or the view.
- **Originals are kept encrypted.** Each uploaded original is stored encrypted on this computer.
  The AI still only ever sees the redacted passages.
- **One implementation.** The web hands uploads, opens and removals to the same Python `/add-on`
  code, through a small CLI. The web keeps reading the index itself (read-only) for the list and
  for the assistant.

## The CLI contract (`python -m reconix.knowledge`)

Run with the dashboard's Python (`RECONIX_PYTHON`, else the repo's `.venv`, as
`web/scripts/serve.mjs` already finds it). It honours `RECONIX_KNOWLEDGE_DIR` and
`RECONIX_KNOWLEDGE_KEY_FILE` (default `~/.reconix/knowledge.key`, 0600, created with O_EXCL).
Output is one JSON object on stdout unless noted. Exit 0 means ok, 2 means refused (`{"ok":false,
"error":"<message fit for an operator>"}`), 1 means an internal error (a fixed message).

| Command | Does | Prints |
|---|---|---|
| `add --file <path> --name <display name> --source web\|terminal` | Ingests like `/add-on`: the same checks and limits, redaction, passages. The original is kept encrypted. | `{"ok":true,"source":{id,name,kind,bytes,chunks,added_at,source,original:true}}` |
| `list` | Lists the sources. | `{"ok":true,"sources":[…]}` |
| `original <id>` | Decrypts the original. | **Raw bytes** of the original on stdout; errors as JSON on stderr. |
| `remove <id>` | Deletes its index entry, passages and encrypted original. | `{"ok":true}` |

- **On disk:** `index.json` sources gain `"source":"web"|"terminal"` and `"original":true|false`.
  An older entry has neither field; it reads as `terminal` and `false`.
- **Original file:** `<id>.orig` in the knowledge folder, 0600, Fernet-encrypted with the
  knowledge key.
- **Display name:** cleaned and redacted. The web passes the uploaded file's base name, never a
  path.
- **Terminal `/add-on`:** keeps originals too, with source `terminal`.

## Web routes (operator only; Origin checked on writes)

| Route | Does | Notes |
|---|---|---|
| `GET /api/knowledge` | The list | Read from the index directly, as `lib/assistant/knowledge/read.ts` does. |
| `POST /api/knowledge` | Upload | multipart, one file, ≤ 10 MB, the extension allow-list. The file is written to a private temp file (0600 in a 0700 temp dir), the CLI runs `add`, then the temp file is deleted. One upload at a time, a timeout, and a rate limit. |
| `GET /api/knowledge/<id>/original` | Open the original | The CLI runs `original <id>`. The response has the right `Content-Type`, `Content-Disposition` (inline for pdf/txt/md/json, attachment for docx; the name sanitised) and `X-Content-Type-Options: nosniff`, plus a sandbox CSP for inline types. |
| `DELETE /api/knowledge/<id>` | Remove | The CLI runs `remove <id>`. |

- **Processes:** the CLI is spawned with fixed arguments (no shell) and a minimal env, which
  never includes `LLM_*` keys.
- **CLAUDE.md:** "Read-only for assessments" stays true. The knowledge folder is not assessment
  data. The docs and `CLAUDE.md` name the new writes and the process the dashboard starts.

## Figma ("Local Web UI (Copy)")

- **The model popup:**
  - the models list with + Model
  - the Set the provider popup (local, and cloud allowed)
  - the remove confirm
  - The Environment row is gone everywhere.
- **The AI Assistant:** the Security knowledge button.
- **The knowledge view, desktop and phone:**
  - the table, the grid and a search with results
  - the upload dialog (choose a file, uploading, a refusal)
  - the open-original preview (PDF in the browser)
  - the remove confirm
- **Prototype:** every control leads to a frame (no web addresses), checked with the offline
  edge check and W91.

## Checks

- `pytest -q` (the CLI, originals, sources)
- web: `npm test`, lint, typecheck, build, full e2e
  - upload each type
  - search, the table/grid switch and open
  - remove
  - a refused `.doc`
  - viewers blocked
  - the picker's + Model flow with no env
- live in Chrome
- Figma: rebuilt, then W91 and exported frames
