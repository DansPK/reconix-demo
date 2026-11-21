# Backend v2 comparison — before implementation

Reference: `reconix-core-backend`, default branch `Develop`, commit
`b965655eb4c7d318ea5ebc15f4b8fbfa6043ddea` (2026-11-20), cloned outside this
repository at `C:/Users/nutyo/orca/workspaces/reconix-core-backend-reference`.
Inspected implementation files, rather than relying on the older apps README's
claim that the backend apps are still static. This comparison was recorded before
implementation changes on `demo_v2_integration`, based on `DansPK/coordinator`.

## Scope assumption

Mirror audience-visible TUI and dashboard behavior, plus the source scanner's tool
stages because the backend implements code assessment. Keep the scanner's independent
MCP contract and scripted fix/rescan interaction. Lumina is a target fixture, not a
backend client: its existing customer/card data already agrees with the scripted
breach, so neither its archive nor the marketing site needs changing.

## Differences and affected files

Paths in the backend column are relative to the read-only reference clone; demo
paths are relative to this repository. Related files may be grouped on one row.

| Difference before changes | Backend implementation | Demo files affected / static adaptation |
| --- | --- | --- |
| Older tool catalogs and timed defaults; web plan stops at validation | `apps/tui/reconix/store/templates/{web_url,api,network,source}.py`, `apps/tui/reconix/models/run.py` | `apps/terminal/reconix/store/templates/{web_url,api,network,source,base}.py`, `models/run.py`, `apps/terminal/reconix/store/{plan,parser,scope}.py`: use current catalogs, unlimited default and analysis/report phases, retain scripted execution |
| Findings lack explicit classification, confidence, evidence quality and verification/proof context | `apps/tui/reconix/models/finding.py`, `apps/tui/reconix/store/finding_sections.py`, `services/api/src/reconix_api/schemas/findings.py`, `services/api/src/reconix_api/verification/results.py` | `apps/terminal/reconix/models/finding.py`, `store/{snapshot,templates/base}.py`, `screens/finding_detail.py`; `apps/terminal/web/src/lib/data/{schema,view-types,adapt}.ts`, `apps/terminal/web/src/components/dashboard/finding-detail.tsx`: carry fabricated classification and verification through saved data to both detail surfaces |
| HIGH confirmation lacks typed target | `apps/tui/reconix/store/approvals.py`, approval UI and confirmation forms | `apps/terminal/reconix/store/approvals.py`, approval confirmation UI, caller/support tests: enforce typed target alongside existing one-use token and command hash |
| Exports lack report build/review lifecycle | `services/api/src/reconix_api/schemas/reports.py`, `services/api/src/reconix_api/services/reports.py`, `apps/web/src/components/dashboard/{api-reports,report-download-bar,api-report-list}.tsx` | `apps/terminal/reconix/store/snapshot.py`, `apps/terminal/web/src/lib/data/schema.ts`, `components/dashboard/reports-view.tsx` and report download components: show static versions/build status/sign-off and gate local downloads |
| Dashboard palette/page treatment has diverged | `apps/tui/reconix/theme.py`, `apps/web/src/styles/{tokens,frame,dashboard}.css` | `apps/terminal/reconix/theme.py`, generated `web/src/styles/tokens.css` and narrowly relevant styles: mirror current design without copying API-backed components |
| Scanner narrates only the older scanner pipeline | `services/api/src/reconix_api/schemas/code.py`, `apps/tui/reconix/store/templates/source.py` | `apps/scanner/extension/server/server.ts`: script Semgrep, Gitleaks, Trivy, Grype, OSV-Scanner and Syft stages, retain canned findings and fixes |
| Saved dashboard examples reflect old structure | `apps/tui/reconix/store/snapshot.py`, templates above | `apps/terminal/scripts/make_sample_data.py`, `apps/terminal/web/sample-data/*.json`: regenerate from the local scripted store; do not copy backend lab targets or people |

## Deliberate static boundaries

The backend uses Core API sessions, database state, AI planning/analysis, Kali jobs,
knowledge ingestion, and actual tool output. None of those services or clients will
be imported into this demo. Local snapshot reads, canned chat, and local report
rendering remain the data sources. Existing scope/plan/approval decisions remain
enforced by the demo store. The fabricated Lumina breach and its masked report vs
explicit attacker-view reveal remain required by root `CLAUDE.md`; backend templates
have no canned findings and cannot simply replace those fixtures. New finding facts
describe scripted evidence, not a claim that a real scanner was run.

The backend supports informational/unknown severity as well as the four vulnerability
bands. Existing demo fixtures have scored vulnerability findings; no new unscored
findings or changes to the reserved-host safety guard are needed for this alignment.

## Validation plan

Run the required `pytest apps/terminal/tests/test_static_data.py`, targeted store/UI
tests for changed behavior, scanner unit tests/build, and dashboard tests/build.
Regenerate snapshots after store changes, inspect the resulting diff for fabricated
hosts and unchanged customer/card consistency, and verify the reference clone remains
clean with `git status --porcelain` and `git status --short --untracked-files=all`.

## Implementation notes

- Default scope catalogs and network ports now mirror the pinned backend templates;
  all four plans have discovery, scanning, validation, analysis and report. Internal
  recon progress remains for the existing narration but is not an extra visible plan phase.
- Authored finding facts live in `apps/terminal/reconix/store/finding_facts.py`.
  Backend enum values are preserved: evidence quality HIGH/MEDIUM, exploitability
  DEMONSTRATED/PLAUSIBLE, verification status CONFIRMED/UNCONFIRMED/INCONCLUSIVE,
  and a separate effective-verification outcome VERIFIED/UNVERIFIED/INCONCLUSIVE.
  Source patterns and scanner imports never become verified from legacy labels alone.
- Scope/tool overrides still apply to scripts, plan tool lists and findings together.
- HIGH approvals now open the existing typed-target form after the safe-default
  confirmation. Wrong targets retain the token; cancellation invalidates it.
- Report generation and sign-off are separate local store actions. Press `a` on the
  TUI report screen after generating a report to sign it off. Every new build clears
  sign-off; finding triage or ingestion invalidates the current report. This prevents
  a signed local download silently changing when current findings change.
- Snapshots include report build/review metadata. The dashboard displays the current
  recorded versions, and both buttons and direct local export requests require READY,
  APPROVED review, signed_off and an available format. No historical immutable report
  downloads are advertised: local exports represent the current reviewed snapshot.
- Sample generation builds completed reports after all imported findings and triage
  decisions, then records an explicit scripted review. The October 2 source assessment
  remains unsigned to demonstrate locked downloads. All 14 files are regenerated.
- The reserved-host guard in `test_static_data.py` is unchanged. Only its obsolete
  web-plan expectation changed. An additional test checks every checked-in snapshot,
  distinguishes exact generated report filenames from hostnames, and checks both
  signed and unsigned report examples.
- The Lumina archive and public marketing site have no changes. No production API,
  AI/model, Kali, real scanner or credential-validation integration was introduced.

## Validation evidence

- `git ls-remote --symref <backend-url> HEAD` returned default `Develop` and
  `b965655eb4c7d318ea5ebc15f4b8fbfa6043ddea`; the clone's log identifies the latest
  default-branch implementation as 2026-11-20.
- `python apps/terminal/scripts/make_sample_data.py`: 14 assessments written.
- `pytest apps/terminal/tests/test_static_data.py`: **91 passed in 0.67s** (standalone final run).
- Store, security, scope, template, plan, approval and Pilot suite (11 files):
  **278 passed in 124.43s**. The files were test_static_data, test_store_gates,
  test_security, test_approval_edit, test_templates, test_plan, test_store_policy,
  test_typed_target, test_gates_ui, test_plan_screen and test_scope_view.
- `pytest apps/terminal/tests/test_static_data.py apps/terminal/tests/test_backend_alignment.py apps/terminal/tests/test_store_report.py -q`:
  **115 passed in 4.83s** (after review fixes). This includes report masking, typed verification,
  report sign-off invalidation and reserved hosts in checked-in snapshots.
- Finding/report Pilot and finding-ingestion tests: **19 passed in 19.85s**,
  including the separate report sign-off key.
- Web: `npm run typecheck`, `npm run lint`, `npm run build` passed; production
  build generated **17/17 pages**. After report-format consistency updates,
  six report test files passed **81 tests**, and the build passed again.
- Web portable suite:
  `npx vitest run --maxWorkers=2 --testTimeout=15000 --exclude tests/store.test.ts --exclude tests/knowledge-read.test.ts`:
  **33 test files passed; 569 passed, 9 skipped**. The initial full run exposed
  Windows path, symlink and FIFO assumptions in the two excluded files. Two
  concurrency timeouts passed when retried with two workers. Those filesystem
  tests were not weakened. Stale assertions about old tool catalogs, methodology,
  domains and time limits were updated to current expectations.
- Scanner: `npm run build` and `npm run typecheck` passed. The six-tool MCP
  pipeline test passed. After adding Git's bundled OpenSSL to process PATH:
  `node --test --test-skip-pattern='walk applies skip list' 'out/test/unit/**/*.test.js'`:
  **63 passed, 0 failed**. The skipped existing walker test needs Windows symlink
  privilege (`EPERM`); TLS failures from the first run were resolved with OpenSSL.
- Orca browser: inspected the signed report and finding detail, and verified the
  unsigned report disables PDF/JSON/DOCX with the review explanation. No horizontal
  document overflow on the inspected report viewport; browser console had no entries.
- Python compileall and `git diff --check` passed. Pytest emits an existing
  pytest-asyncio default-loop-scope deprecation warning.

The full unfiltered cross-platform suites are not claimed to pass on this Windows
host. The required safety test and change-specific checks pass. Live service parity,
production sign-in, background jobs and actual security testing are intentionally
outside this static integration.

Final follow-up checks: the HIGH/typed-target Pilot path passed **7 tests** after
switching the form to the app-owned dialog seam. Report generations now increment
version numbers, record their actual build time and use assessment-unique IDs.
Closed potential findings are neither counted nor described as confirmed.

## Independent Luna review

Used the `orca-cli` and `orchestration` skills to start `gpt-6-luna` at `xhigh`
in the isolated child worktree `luna-v2-review`, dispatch `ctx_ec4cd36d2711`.
The reviewer inspected the parent diff and read-only backend reference, made no
edits, and reported two P2 findings. Both are fixed:

1. Report invalidation now resets report-phase progress as well as clearing the
   path and sign-off. The saved plan correctly returns to an active report step.
2. Both TUI and dashboard recognize `finding_category=FALSE_POSITIVE`, even if
   triage status is still open. Such a finding is neither confirmed nor awaiting
   vulnerability review and is excluded from dashboard risk counts.

The reviewer found no new network client, fabricated host/card, tool/phase or
typed-target issue. New regression tests cover both corrections. Follow-up checks:
**115 Python safety/report tests passed**, **100 focused dashboard/stats/lifecycle
tests passed**; the production build was rerun after the final change.

## Complete changed-file manifest

The following paths are relative to the demo repository. The list includes source,
required regression updates, generated snapshots and this comparison document.

- `apps/scanner/extension/server/server.ts`
- `apps/scanner/extension/test/unit/flow.test.ts`
- `apps/terminal/reconix/models/assessment.py`
- `apps/terminal/reconix/models/finding.py`
- `apps/terminal/reconix/models/run.py`
- `apps/terminal/reconix/screens/approval.py`
- `apps/terminal/reconix/screens/finding_detail.py`
- `apps/terminal/reconix/screens/findings_list.py`
- `apps/terminal/reconix/screens/forms/typed_target.py`
- `apps/terminal/reconix/screens/report.py`
- `apps/terminal/reconix/store/__init__.py`
- `apps/terminal/reconix/store/approvals.py`
- `apps/terminal/reconix/store/finding_facts.py`
- `apps/terminal/reconix/store/findings.py`
- `apps/terminal/reconix/store/findings_view.py`
- `apps/terminal/reconix/store/parser.py`
- `apps/terminal/reconix/store/plan.py`
- `apps/terminal/reconix/store/report.py`
- `apps/terminal/reconix/store/report_html.py`
- `apps/terminal/reconix/store/report_view.py`
- `apps/terminal/reconix/store/scope.py`
- `apps/terminal/reconix/store/snapshot.py`
- `apps/terminal/reconix/store/templates/__init__.py`
- `apps/terminal/reconix/store/templates/api.py`
- `apps/terminal/reconix/store/templates/base.py`
- `apps/terminal/reconix/store/templates/network.py`
- `apps/terminal/reconix/store/templates/source.py`
- `apps/terminal/reconix/store/templates/web_url.py`
- `apps/terminal/reconix/theme.py`
- `apps/terminal/reconix/widgets/findings.py`
- `apps/terminal/scripts/make_sample_data.py`
- `apps/terminal/tests/support.py`
- `apps/terminal/tests/test_approval_edit.py`
- `apps/terminal/tests/test_backend_alignment.py`
- `apps/terminal/tests/test_findings_report_ui.py`
- `apps/terminal/tests/test_gates_ui.py`
- `apps/terminal/tests/test_persist.py`
- `apps/terminal/tests/test_plan.py`
- `apps/terminal/tests/test_scope_view.py`
- `apps/terminal/tests/test_security.py`
- `apps/terminal/tests/test_static_data.py`
- `apps/terminal/tests/test_store_gates.py`
- `apps/terminal/tests/test_store_policy.py`
- `apps/terminal/tests/test_store_report.py`
- `apps/terminal/tests/test_templates.py`
- `apps/terminal/tests/test_typed_target.py`
- `apps/terminal/web/sample-data/20260928-091200-1cea_RCX-001.json`
- `apps/terminal/web/sample-data/20260929-112000-8c51_RCX-001.json`
- `apps/terminal/web/sample-data/20260929-112000-8c51_RCX-002.json`
- `apps/terminal/web/sample-data/20260930-160500-8a01_RCX-001.json`
- `apps/terminal/web/sample-data/20261001-083000-2265_RCX-001.json`
- `apps/terminal/web/sample-data/20261001-083000-2265_RCX-002.json`
- `apps/terminal/web/sample-data/20261001-083000-2265_RCX-003.json`
- `apps/terminal/web/sample-data/20261002-134000-f4be_RCX-001.json`
- `apps/terminal/web/sample-data/20261003-101500-3ceb_RCX-001.json`
- `apps/terminal/web/sample-data/20261003-101500-3ceb_RCX-002.json`
- `apps/terminal/web/sample-data/20261004-150000-3c6d_RCX-001.json`
- `apps/terminal/web/sample-data/20261005-140300-9f76_RCX-001.json`
- `apps/terminal/web/sample-data/20261005-140300-9f76_RCX-002.json`
- `apps/terminal/web/sample-data/20261006-090000-cb18_RCX-001.json`
- `apps/terminal/web/src/app/api/assessments/[uid]/export/route.ts`
- `apps/terminal/web/src/components/dashboard/derive-report.ts`
- `apps/terminal/web/src/components/dashboard/derive.ts`
- `apps/terminal/web/src/components/dashboard/finding-detail.tsx`
- `apps/terminal/web/src/components/dashboard/report-downloads.tsx`
- `apps/terminal/web/src/components/dashboard/report-runs.tsx`
- `apps/terminal/web/src/components/dashboard/report-types.ts`
- `apps/terminal/web/src/components/dashboard/report-versions.tsx`
- `apps/terminal/web/src/components/dashboard/reports-view.tsx`
- `apps/terminal/web/src/lib/data/adapt.ts`
- `apps/terminal/web/src/lib/data/format.ts`
- `apps/terminal/web/src/lib/data/schema.ts`
- `apps/terminal/web/src/lib/data/stats.ts`
- `apps/terminal/web/src/lib/data/view-types.ts`
- `apps/terminal/web/src/lib/report/docx/report.ts`
- `apps/terminal/web/src/lib/report/html.ts`
- `apps/terminal/web/src/lib/report/lifecycle.ts`
- `apps/terminal/web/src/styles/dashboard.css`
- `apps/terminal/web/src/styles/tokens.css`
- `apps/terminal/web/tests/__snapshots__/single-report.html`
- `apps/terminal/web/tests/combined-html.test.ts`
- `apps/terminal/web/tests/combined-select.test.ts`
- `apps/terminal/web/tests/dashboard.test.ts`
- `apps/terminal/web/tests/report-html.test.ts`
- `apps/terminal/web/tests/report-lifecycle.test.ts`
- `apps/terminal/web/tests/stats.test.ts`
- `docs/BACKEND_V2_COMPARISON.md`
