# No roles, and the workflow board, the web UI and Figma in step

Status: in progress (2026-10-22). Branch `feature/next-update`; parallel branches `r8/*` merge into
it. Source: the owner's review "Workflow vs UI: Summary" (FigJam "Reconix - Workflow" › Reconix
Local Application vs Figma "Local Web UI (Copy)": 27 has, 18 missing, 5 different, 4 component only).

## Owner's decisions

- **No roles.** The dashboard has one local user: no `viewer` / `operator`. You still sign in with
  the link the dashboard prints (session cookie, 12 h), on 127.0.0.1 only, with the Host and Origin
  checks. Signed in, everything is open: Overview, Assessments, Findings, Reports, Docs, the AI
  Assistant (its model chip, + Model), Security knowledge, and the Terminal while the dashboard hosts
  it. Every "needs the operator role" check, message, state, test and frame goes.
- **Everything in the review is fixed, in code, Figma and the board.** The code is the source of
  truth: Figma draws what the code shows, and the board describes what the code does.
- The TUI's "operator" (the analyst's name in the audit log and the snapshot) is a person, not a
  role: it stays.

## 1. No roles (web code)

Status: **done** (2026-10-22, branch `r8/no-roles`). `session.ts` has `sessionValue(token)` /
`readSession()` (signed `reconix-web:session:<issued>`, so an old `<role>.<issued>.<sig>` cookie
never reads, prefixed or not); `guard.ts` has `signedIn()`, `requireSignedIn()` and
`terminalAccess(): "on" | "off"`. Handlers behind the proxy now answer a missing session with
**401 "Sign in first."** (they answered 403 with the role message); a terminal route while the
terminal is off answers 403 "The terminal is off: this dashboard was started with --no-terminal.",
and the ticket route without the key 403 "The terminal's key is missing or has expired. Sign in
again with the dashboard's link." Also gone: the History button's disabled state ("The saved
conversations need the operator role"), the sidebar's "Terminal · operator role needed" tooltip,
`allowedView` / `OPERATOR_VIEWS`, and `isAssistantPath` / `isKnowledgePath` (unused now). The
sign-in route answers `{ signedIn: true, terminal }` instead of `{ role }`. New tests:
`web/tests/access.test.ts` (proxy + ticket route) and the access e2e's old-cookie, signed-in and
terminal-off cases (the latter on the `--no-terminal` live-refresh server).

- `lib/auth/session.ts`: the session cookie names no role (`<issued>.<signature>`); an old cookie
  with a role no longer reads, so it signs in again. `ROLES`, `hasRole`, `signInRole`, the role in
  `currentRole()` go: `signedIn()` answers yes or no.
- `proxy.ts`: every page and route except the sign-in page and route needs a session. The
  Terminal's routes still need the dashboard to host the terminal **and** the terminal key cookie
  (`Path=/api/terminal`), set at sign-in while the terminal is on; a ticket is still single use.
- Pages, handlers and views: the role checks become session checks (they still check again behind
  the proxy). Gone: the Terminal view's "viewer" state, the model chip's disabled "needs the operator
  role", the hidden Security knowledge button and view, every 403 that names a role.
- Tests and e2e: the viewer cases become signed-out cases (401/redirect) and "terminal off" cases.
- Docs: `CLAUDE.md`, `web/CLAUDE.md`, `web/README.md`, the in-app docs (`content/docs/`), the
  docstring in `reconix/webterm/ticket.py`.

## 2. The review's items

The code is checked for each; a state the code has gets its Figma frame; a state the board shows
that the code lacks is built when it is a small, real behaviour, else the board is corrected.

| Area | Item | Fix |
|---|---|---|
| Sign-in | sign-in page; link without a token; link expired; 403 off 127.0.0.1; signed out → Sign-in; cookie expired | Figma frames for each state `/login` shows (desktop + phone) |
| Overview | no saved assessments | the empty Overview frame, reachable |
| Overview | duration vs time limit; example questions | match the code's Duration card and the ask bar's examples |
| AI Assistant | too many questions (429); Open Terminal link; History Rename; delete one chat; Progress / Approvals / Policy / Report cards | frames for each, from the code's strings |
| AI Assistant | top bar | what the code shows on the assistant view, on the board and in Figma alike |
| Findings | finding not found (bad id); hidden by filters → "Show it"; totals 41 vs 40 | frames; the totals agree everywhere (root cause found and fixed in code or data) |
| Reports | one-run PDF error; combine → Generate DOCX; preview failed → Retry; selection changed → preview again; runs table (RUN column, JSON) | frames; the runs table as the code draws it |
| Terminal | Terminal is off; couldn't open a session | frames (the "no operator role" state is gone) |
| Top bar | Paused / Static live pill | frames for the states the code has |
| Board | Docs pages, the AI model popup, the top bar's Target / Template / Status menus | added to the board (in the UI, not in the workflow) |

## 3. Board ("Reconix - Workflow" › Reconix Local Application)

- Role nodes go: Terminal's "Operator role?" / "Needs the operator role", AI Assistant's "Operator
  and a model?" (becomes "A model chosen?") and W65's "Operator role?" (Security knowledge opens for
  everyone signed in).
- The additions in §2's last row, in the board's format (preview first, owner's OK, then drawn;
  only the nodes this work names are touched; a section grows only into free space).

## 4. Checks

- `pytest -q`, ruff; web `npm test`, lint, typecheck, build, full e2e.
- Figma: offline `check-all.mjs` and `audit.mjs` (0 url / missing / unreachable), then W50 and W91
  in the file (0 fails, 0 dangling).
- Board: the step's own checks, then a screenshot.
