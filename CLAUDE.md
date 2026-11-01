# CLAUDE.md

Guidance for Claude Code working in this repository. Per-app `CLAUDE.md` / `README.md` files hold
the detail; this is the top-level map and the rules that span apps.

## What this is

**Reconix** — a demo of an AI-assisted security-assessment product, shown to (often non-technical)
audiences. Everything is a **static, scripted demo**: no live LLM, no real backend, no real scanning.
All data is fabricated. The headline story: Reconix assesses the **Lumina** online store, finds a
**critical SQL injection**, escalates its plan to extract and crack the customer database, and reveals
the leak — emails, phones, addresses, saved **credit cards**, cracked passwords.

## Monorepo layout (`apps/`)

| App | What it is | Run |
| --- | --- | --- |
| `apps/terminal/` | The Reconix **TUI** (Textual/Python, a scripted assessment) **and** the **web dashboard** (Next.js, reads `web/sample-data/`, no sign-in). The core demo. | `./setup.sh tui` · `./setup.sh web` |
| `apps/scanner/` | A **VS Code extension** + bundled scanner server that flags planted vulns in an open folder and applies fixes (fix → rescan drops the finding). | `./setup.sh scanner` · `./setup.sh vscode` |
| `apps/public-web/` | The public Reconix marketing site (Next.js). | `./setup.sh site` |
| `apps/lumina-site/` | The **Lumina storefront** (React/Vite) — the demo target the audience sees. Runs **offline on mock data** (`npm run dev`); planted vulnerable backend in `apps/lumina-site/server/`. | `cd apps/lumina-site && npm run dev` |

`setup.sh` (bash / Git Bash) and `setup.ps1` (PowerShell) are the unified launchers; each surface takes
over a terminal, so run them separately. The storefront folder `apps/lumina-site/` is **gitignored**
(the VS Code demo edits it when you "Fix" a finding); the pristine copy is the tracked
**`apps/lumina-site.zip`**, extracted on first run, and `./setup.sh reset` re-extracts it to undo a
fix/rescan demo. Re-zip after changing the storefront (bsdtar: `tar --format=zip`, exclude node_modules).

## The two scan surfaces (don't conflate them)

- **TUI + web dashboard** (`apps/terminal/`): a **URL assessment** of `www.lumina.com`. Findings are
  seeded in `reconix/store/templates/web_url.py`; the run is a scripted sequence of steps. The critical
  finding (`004`) is the SQL injection with a masked customer-dump table in `evidence` and the raw table
  in `evidence_unmasked` (revealed by the detail screen's **`u`** toggle in the TUI and a "Reveal
  attacker's view" toggle in the dashboard). PDF/DOCX reports stay masked.
- **VS Code scanner** (`apps/scanner/`): a **source scan** of `apps/lumina-site/`. Canned findings
  (`extension/server/server.ts` `DEMO_FINDINGS`/`FIXES`) match files under `apps/lumina-site/server/`
  by path; applying a fix changes the file's hash, so a rescan drops that finding.

## Cross-cutting rules

- **Demo data must look real.** Use realistic names, brands (Lumina), domains (gmail.com, yahoo.com,
  lumina.com) and values in anything the audience sees. Avoid `example.com`-style placeholders and the
  literal word "demo" in audience-facing data (code flags/comments like `VITE_DEMO` are fine).
- **But keep the safety guard.** `apps/terminal/tests/test_static_data.py` asserts every hostname in a
  saved snapshot is a reserved domain. Realistic email providers are allowed via the documented
  `DEMO_LEAK_DOMAINS` exception — extend that list rather than removing the guard. All data stays
  fabricated/reserved: no real people and no real targets. Card numbers are **fabricated but
  realistic** — Luhn-valid with a correct brand BIN, **generated** (never copied from a real card,
  never a stored CVV); avoid the obvious repeated-digit test PANs (`4242 4242 4242 4242`) in
  audience-facing data, they read as fake.
- **Static demo only.** Don't wire a live LLM/backend/scanner. See `apps/terminal/CLAUDE.md` for the TUI's
  store/seam conventions (the store is the security boundary; screens never hold data literals).
- **Keep the two engines consistent.** The storefront account shows Sophea + Visa ****5466; that must
  equal the leaked row the Reconix URL assessment reveals (same card, phone, and MD5↔cracked password).

## Verifying changes

- TUI/store: `cd apps/terminal && pytest -q` (note: ~24 failures are **pre-existing and
  platform-specific** on Windows — file-permission/symlink/FIFO tests in `test_persist`,
  `test_knowledge_cli`, `test_knowledge_store`, `test_openapi`, and node/dashboard-env tests in
  `test_web_dashboard`, `test_findings_report_ui`; everything else passes. Baseline against clean
  HEAD before blaming a change).
- Web dashboard: `cd apps/terminal/web && npm run build` (compiles + typechecks).
- Storefront: `cd apps/lumina-site && npm run build` (or `npm run dev`).
- After a store/process change, regenerate dashboard data: `cd apps/terminal && python scripts/make_sample_data.py`.
