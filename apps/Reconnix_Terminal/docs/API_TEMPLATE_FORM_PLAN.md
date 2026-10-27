# API template: one form for the base URL and the spec

Status: done (2026-10-22). Branch `r11/api-form` off `feature/next-update`. Follows
`API_SCHEMA_FOR_AI_PLAN.md`, where the form already opens on its own.

## Owner's decisions

- **One form when the API template is chosen.** The form that opens on its own, and again from
  the Scope menu's Attach / Replace, has:
  - **API base URL**: prefilled from the draft scope's target.
  - **OpenAPI spec (optional)**: a file path, or an `https://` URL.
  - Leave the spec empty to keep only the base URL.
- **The base URL may change the target before scope approval.** The store validates it with the
  same rules as a typed target, then re-drafts the API scope for the new target; the manifest you
  approve shows it. After approval the form is not offered, as today.
- **A spec URL is downloaded only from the API's own host.**
  - The host must be the target's host. Over `https`, or `http` only for localhost / 127.0.0.1.
  - At most 5 MB, no redirects, a 10 s timeout, read only.
  - Audit-logged: `api_spec.fetched` with the host and path, never the query.
  - The same checks as a file then apply: OpenAPI 3 / Swagger 2, redacted, and it never widens
    the scope.
  - The fetch runs in a worker, as the file read does.

## The form (exact text)

- **Title:** `⇡ API TEMPLATE: BASE URL AND SPEC`. **Chip:** `Scope`.
- **Fields:**
  - `API base URL`, placeholder `https://api.example.com`
  - `OpenAPI spec (optional)`, placeholder `~/specs/openapi.yaml or https://api.example.com/openapi.json`
- **Note:** `The spec is only read, never run, and never widens the scope. A spec URL must be on
  the API's own host.`
- **Buttons:** Submit `Save`, and `Cancel`. **Footer:**
  `Leave the spec empty to skip it · Esc to cancel`.
- **Errors**, from the store, shown in the form:
  - `The spec URL must be on <host>.`
  - `The spec URL must use https.`
  - `Couldn't download the spec: <reason>.`
  - the existing file and parse errors

## Behaviour choices (implementation, 2026-10-22)

- **Store:** `store.save_api_form(base_url, spec)` (`store/api_form.py`) does it all; the form
  calls it in a worker. The download lives in `store/openapi_fetch.py`; `attach_api_spec`
  takes a file or a URL through the same `openapi.load_spec`.
- **Nothing changes on a refusal.** The base URL is validated and the spec read (and checked
  against the *new* target's host) before the draft is touched, so a bad base URL or spec
  leaves the target and any attached spec as they were, and the form stays open.
- **Empty spec:** keeps only the base URL; a spec already attached stays (Remove is in the
  Scope menu). Same base URL and empty spec: the form just closes.
- **A new base URL** keeps the operator's draft (methods, excluded paths, ports, tools, time
  limit) with the new target, rebuilds what the template derives from the target (findings,
  approvals, the steps after the scope gate, plan) and logs `scope.retargeted` (old → new).
  An attached spec is re-checked: if it names servers and none is on the new target it is
  removed (methods restored as by Remove, the AI's digest cleared, `api_spec.removed`
  "<name> (target changed)", a notice in the chat and the form's notification); otherwise it
  stays and its servers are sorted again. Its endpoints are paths under the target and its
  methods are never added, so keeping it never widens the scope.
- **Spec URL:** the host is compared with the target's host name (the port may differ); the
  host check comes before the scheme check. No proxy, no cookies, no credentials (a URL with
  `user:pass@` is refused: `The spec URL can't include a user name or password.`); the
  10 s limit is a socket timeout plus a deadline checked while reading; the 5 MB cap is the
  declared length and a hard cap on the bytes read. JSON when the path ends in `.json` (or the
  type says JSON, without a `.yaml`/`.yml` path), else YAML. `api_spec.fetched` is logged after
  a successful download with `host/path` (redacted), never the query. Download reasons:
  `the server redirected it (HTTP 3xx)`, `the server answered HTTP <code>`,
  `it is over 5 MB`, `no answer within 10 s`, `the connection failed`,
  `the TLS connection failed`, `it isn't UTF-8 text`, `the URL isn't valid`.
- **Esc** is ignored while the store reads (as the file form did); Submit is disabled.
- **Scope menu:** the Attach / Replace description reads `a .json or .yaml OpenAPI 3 /
  Swagger 2 file or URL; read, never run`.

## Checks

- `pytest -q` and ruff:
  - URL validation: a foreign host, plain http, a redirect, too large, a timeout. Use a local
    test server, never a real network.
  - The target change re-drafts the scope; refused after approval.
  - The Pilot form flow.
- TUI Figma file: `F:openapi` becomes this form, with its error state.
