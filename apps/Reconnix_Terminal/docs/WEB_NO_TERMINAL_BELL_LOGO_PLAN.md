# Web: no terminal, no bell, no sidebar logo

Status: done (2026-10-22) on `r10/web-trim` (off `feature/next-update`).

## Owner's decisions

- **The whole web terminal goes.** That means the sidebar's Terminal item, the Terminal view
  (`?view=terminal`, `/terminal`), the AI Assistant cards' "Open Terminal" buttons, the
  ticket/key routes (`/api/terminal/*`, the terminal key cookie), `reconix/webterm/`, the part of
  `web/scripts/serve.mjs` that starts it, `--no-terminal`, their tests, e2e and docs. The TUI
  itself and `/web` stay.
- **The notification bell goes** from the top bar, with its panel.
- **The logo goes** from the left sidebar.
- **Code and Figma change together.** In Figma that means the components (Sidebar, TopBar,
  SidebarItem) and every frame.

## What changed

- **Terminal, Python side:** `reconix/webterm/` and `tests/test_webterm_*.py` deleted;
  `websockets` and `pywinpty` dropped from `requirements.txt` and `pyproject.toml`
  (`reconix.webterm` out of the packages list); `/web` no longer has an "already on the
  Terminal page" case (`RECONIX_IN_WEB` gone).
- **Terminal, web side:** no sidebar Terminal item, no `?view=terminal`, no `/terminal` page, no
  `/api/terminal/*` routes (both 404 now), no terminal key cookie or tickets
  (`lib/auth/ticket.ts`, `lib/terminal/*`, `components/terminal/*`, `styles/terminal.css` gone);
  `scripts/serve.mjs` starts only Next.js (no helper, no `--no-terminal`, no
  `RECONIX_TERM_PORT`); the CSP has no helper origin. The sign-in (link → session cookie,
  127.0.0.1 only, Host/Origin checks) is unchanged.
- **AI Assistant:** its cards have no "Open Terminal" button; the approvals card keeps "Decide in
  the TUI. Nothing can be approved from this chat." with no button.
- **Knowledge CLI stand-in:** its test switch is `RECONIX_KNOWLEDGE_CLI_TEST=1` (was
  `RECONIX_TERM_TEST`).
- **Top bar:** no bell and no panel, on every view and size.
- **Sidebar:** no logo at the top; the views start at the top of the rail, Documentation stays at
  its foot.
- **Docs:** every mention of the web Terminal page, `--no-terminal`, websockets/pywinpty and the
  bell is gone from the in-app docs (Getting started, Guardrails, the assessment guide,
  Troubleshooting, `/web`'s errors). The in-app "Terminal guide" group stays: it documents the
  TUI itself (its screens, keys and command bar), not the web terminal, so no docs address
  changed and no redirect was needed. `CLAUDE.md`, `README.md` and `web/README.md` updated.

## Checks

`pytest -q`, ruff, the web's `npm test`, lint, typecheck, build and full e2e. Figma: the offline
check and audit (0 url, missing or unreachable), then W50/W91 in the file.
