# Plan — the Reconix TUI inside the web dashboard (Terminal page)

2026-10-07. Follows `WEB_DASHBOARD_PLAN.md`. Status: **built** (approved 2026-10-07).

Changes made while building, compared with the draft below:

- **The session survives browsing.** It lives in the dashboard layout
  (`components/terminal/terminal-dock.tsx`), mounted on the first visit to `/terminal` and
  only hidden on the other pages, instead of ending whenever you leave the page.
- **`connect-src` allows the helper on every page** while the terminal is on, not on
  `/terminal` only: a client-side navigation keeps the policy of the page it started on.
- **The pty program has no controlling terminal**, so a resize sends SIGWINCH itself.
- **websockets' frame logging is pinned off** (`reconix.webterm.ws` at WARNING): at DEBUG
  it would log what is typed. A test checks the log never holds the typed password.
- **The helper watches its stdin** (`RECONIX_TERM_WATCH_STDIN`) and stops when the launcher
  dies, so it never outlives the dashboard.
- Terminal colors are web tokens `term-bg`, `term-text`, `term-cursor` (`theme.py`).
- **Only keystrokes count as activity** for the 30-minute idle close: resizes come from
  the window, and the TUI's output never stops (its cursor blinks).
- **Large pastes are split** into 32 KiB frames (the helper accepts up to 64 KiB each).
- A refused ticket shows the dashboard's own reason; a cancelled `PtySession.close()` still
  kills and reaps the program.

After the security review (2026-10-07):

- **The sign-in link stays out of logs.** `serve.mjs` prints it only to a TTY; `web.log` is
  created 0600 (an older one is tightened) and folders the app creates (`~/.reconix`) 0700.
- **The helper proves itself.** Its first frame is a hello with
  `HMAC(token, "reconix-term-hello:" + nonce)`; the ticket route gives the page the same
  value. Until it matches, the page sends nothing (another program on port 3101 gets no
  keystrokes and can't fake the TUI). `serve.mjs` logs it when the helper stops.
- **A terminal key cookie** (`reconix_term`, `Path=/api/terminal`, its own signature) is
  needed to mint a ticket, so the session cookie, which other servers on 127.0.0.1 and the
  helper's socket can see, can't open a terminal by itself.
- **The pty is the TUI's controlling terminal** (set by a small isolated `python -I`
  bootstrap: setsid + TIOCSCTTY, then exec). If the helper dies in any way, the kernel
  hangs up its TUIs. The helper also stops cleanly on SIGHUP and SIGQUIT.
- **Control frames are at most 256 characters** before JSON parsing (no RecursionError).
- **The TUI runs from the helper's folder (the repo root) with `PYTHONSAFEPATH=1`**, not
  from the home folder.
- **`RECONIX_TERM_COMMAND` needs `RECONIX_TERM_TEST=1`**, and the helper warns in test mode.
- Not changed: `/web` still starts `npm run dev` (dev CSP: `'unsafe-eval'`, any `ws:`);
  starting a production build from `/web` is a possible follow-up.

## Decisions (from the user)

- **Full control.** The browser can start assessments, type targets, answer every gate and
  approve, exactly like the terminal app.
- **Embed the real TUI**, not a React re-implementation: the same screens, commands and
  store gates run in the browser, so nothing is duplicated and no gate can drift.
- **Separate session.** Each browser terminal is its own `python -m reconix` process with
  its own in-memory store. Its assessments reach the rest of the dashboard through the
  usual saved copies (`~/.reconix/assessments/`).
- **Local only.** 127.0.0.1, the existing launch-token sign-in, one person.

This **replaces** the dashboard's "read-only" rule with: *read-only except the Terminal
page, which hosts the TUI itself; every decision still goes through the TUI's store.*

## Why not `textual-serve`

Checked v1.1.3: it has no authentication and no `Origin` check (any web page in the
browser could open a session with full control), it serves its own page (we would need to
frame another port), loads Google Fonts, and pulls in aiohttp + jinja2. A small bridge of
our own is about the same amount of code and lets us lock it down.

## Architecture

```
browser ── /terminal (Next.js, operator role) ──POST /api/terminal/ticket──▶ ticket (60 s, single use)
   │  xterm.js
   └── ws://127.0.0.1:3101/?ticket=… ──▶ python -m reconix.webterm  (Host + Origin + ticket checks)
                                              └─ pty ─▶ python -m reconix   (one per connection)
```

- Wire protocol: **binary frames** carry terminal bytes both ways; **text frames** are JSON
  control messages (`{"type":"resize","cols":120,"rows":40}`; server → `{"type":"exit"}`).
- `web/scripts/serve.mjs` starts the helper next to Next.js and stops it on exit, passing
  the launch token through the environment. `reconix/web_server.py` passes
  `RECONIX_PYTHON=sys.executable` so `/web` uses the same interpreter.
- Unavailable (no Python, no `websockets`, Windows without `pty`, helper down): the page
  shows a `Notice` with the reason and the command to fix it — no dead end.

## 1. Python side — `reconix/webterm/` (new package)

| File | What it does |
|---|---|
| `__init__.py` | module docstring, `run()` export |
| `__main__.py` | `python -m reconix.webterm`: reads `RECONIX_WEB_TOKEN`, `RECONIX_TERM_PORT` (3101), `RECONIX_WEB_PORT` (3100); refuses to start without a token |
| `ticket.py` | `verify(ticket, token, now) -> bool`: HMAC check, expiry, single use (used nonces kept until they expire) |
| `guard.py` | `Host` must be `127.0.0.1:3101`/`localhost:3101`; `Origin` must be the dashboard (`http://127.0.0.1:3100` / `http://localhost:3100`) |
| `session.py` | `PtySession`: fork `python -m reconix` in a pty, read/write, `TIOCSWINSZ` resize, SIGHUP → SIGKILL on close |
| `server.py` | `websockets` server: guard → ticket → session; at most **2** sessions, **30 min** idle timeout, kills every child when it stops |

Child environment: `TERM=xterm-256color`, `COLORTERM=truecolor`, `RECONIX_IN_WEB=1`, and
**without** `RECONIX_WEB_TOKEN` (the TUI never needs it). With `RECONIX_IN_WEB=1`, `/web`
says "You're already in the dashboard" instead of starting another one.

The helper never logs terminal data (passwords and one-time codes are typed there); it
logs only connect / refuse / exit lines to `~/.reconix/web.log`.

Packaging: add `reconix.webterm` to `[tool.setuptools] packages`; add `websockets` (pure
Python, supports 3.9) to `requirements.txt` and `pyproject.toml`.

## 2. Web side — `web/`

| File | Change |
|---|---|
| `lib/auth/session.ts` | `ROLES = ["viewer", "operator"]`. Sign-in grants **operator** (holding the launch link means you own this machine); `npm start -- --no-terminal` grants **viewer** and turns the page off |
| `lib/auth/guard.ts` | `requireRole(role)`; `requireViewer()` stays as a wrapper |
| `lib/auth/ticket.ts` (new) | `mintTicket(token, now)`: `<expires>.<nonce>.<HMAC(token, "reconix-term:"+expires+":"+nonce)>` |
| `app/api/terminal/ticket/route.ts` (new) | `POST`: same-origin check, **operator** role, returns `{ ticket, url }` |
| `app/(dash)/terminal/page.tsx` (new) | server page, `requireRole("operator")`, renders the panel or the "unavailable" notice |
| `components/terminal/terminal-panel.tsx` (new) | client: xterm.js + fit addon, status pill (Connecting / Connected / Ended), **New session** button, theme read from `tokens.css` variables |
| `components/terminal/use-terminal-socket.ts` (new) | the connection: ticket → WebSocket → resize on fit, clean close on unmount |
| `lib/auth/csp.ts` | `connect-src` adds `ws://127.0.0.1:3101` while the terminal is on |
| `components/layout/nav-links.tsx` | **Terminal** link, shown to operators only (phone grid 4 → 5) |
| `proxy.ts` | `/terminal` and `/api/terminal/*` need **operator**; everything else stays **viewer** |
| `scripts/serve.mjs` | start / stop the helper; `--no-terminal` |
| `package.json` | `@xterm/xterm`, `@xterm/addon-fit` |

Closing or reloading the tab ends that session (its in-memory run is gone, its saved copy
stays). The page warns before that while a session is live. Moving between the dashboard's
pages keeps it. Reconnecting to a running session after a reload is a possible follow-up.

## 3. Security checklist

- Only operators reach the page and the ticket route (proxy **and** handler check).
- The socket needs a valid, unexpired, unused ticket **and** the dashboard `Origin` **and**
  a loopback `Host` — a malicious web page or DNS rebinding can't open a session.
- Tickets are HMAC'd with the launch token, so a dashboard restart invalidates them.
- Gates are unchanged: it is the same TUI process and the same store.
- Keystrokes travel unencrypted over loopback only, like the rest of the local dashboard.
- `TEST_PASSWORD` must never appear in `web.log` or the helper's output.

## 4. Docs to update

`web/README.md` (Rules, Layout, Run), root `CLAUDE.md` (web section + architecture tree),
`README.md`, and a note in `WEB_DASHBOARD_PLAN.md` that the read-only rule now has this one
exception.

## 5. Build order (each step keeps `pytest -q` and `npm test` green)

1. `ticket.py` + `ticket.ts` with a **shared test vector** (same token/time → same ticket).
2. `session.py` + `server.py` + `guard.py`, tested with a stand-in command
   (`RECONIX_TERM_COMMAND`, tests only) instead of the real TUI.
3. Roles (`operator`), proxy, guard, ticket route.
4. Terminal page + panel + nav link + CSP.
5. `serve.mjs` / `web_server.py` start-up, `RECONIX_IN_WEB` in `/web`.
6. Docs; `security-reviewer` and `code-reviewer` passes.

## 6. Verification

- `pytest -q`: ticket (valid / expired / reused / forged), bad `Origin` / `Host` / no ticket
  refused, session limit, resize, child killed on close, token absent from the child env,
  `TEST_PASSWORD` absent from the log.
- `npm test`: ticket parity, roles, CSP per path; `npm run lint && npm run typecheck`.
- `npm run e2e`: operator sees and uses the Terminal page (stand-in command); a viewer
  (`--no-terminal`) gets no link and a 403 from the ticket route.
- By hand: `/web` from the TUI → Terminal → run the demo through every gate in the browser.
