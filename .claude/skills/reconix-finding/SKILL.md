---
name: reconix-finding
description: Add or edit a finding in the Reconix TUI + web-dashboard engine (the scripted URL/API/network/source assessment). Use when changing what the assessment reports, a finding's masked/unmasked evidence, or the find-crack-reveal run beat.
---

# Reconix finding (TUI + dashboard engine)

Findings here are **seeded data**, not real scan output. They live per template in
`apps/terminal/reconix/store/templates/{web_url,api,network,source}.py` — each `_findings(url)` returns
`Finding` dataclasses, and `templates/base.py` (`RunProfile` → `build_rest`) weaves the scripted run.

## The Finding model (`reconix/models/finding.py`)
`fid`, `severity` (CRITICAL|HIGH|MEDIUM|LOW), `title`, `path` (a URL **route**, not a file),
`validation` (CONFIRMED|UNCONFIRMED|INCONCLUSIVE), `description`, `affected_url`, `impact`,
`remediation`, `tool`, `references` (put CWE-/CVE-/OWASP strings here — `.cwe`/`.cve`/`.owasp` derive
from them), `evidence` (masked, `list[str]`), `evidence_unmasked` (raw, `list[str]`), `cvss_score`,
`cvss_vector`, `category`, `status`.

## Masked vs unmasked (important)
- `evidence` is the **masked** view and is what reaches the dashboard AND the PDF/DOCX report.
- `evidence_unmasked` is the **raw** view. It is serialized into the web snapshot (so the dashboard can
  reveal it) but **not** into `report_data()` — so exported reports stay masked. The TUI detail screen
  reveals it with the **`u`** key (`screens/finding_detail.py`), the dashboard with a "Reveal
  attacker's view" toggle (`components/dashboard/finding-detail.tsx`).
- Lay dumps out as space-aligned columns; follow [[realistic-demo-data]] for values, the `•`
  masking bullet, and the redaction keyword shapes to avoid.

## The "plan updates to crack it" beat
Set `exploit_fid` + `exploit_beat` on the template's `RunProfile` (in its `build_run`). `exploit_beat`
is a tuple of scenario steps (`say` / `log` / `card` from `store/scenario.py`); `base.py` plays them
just before that finding's reveal. **Only name approved tools** (`scope.tools`) in step text or a
`card` — `test_static_data.py::test_only_approved_tools_are_named` fails otherwise. The run reveals the
first finding in the validation phase and the rest in analysis; severity sorts CRITICAL to the top of
the list/dashboard regardless of reveal order.

## After editing
1. `cd apps/terminal && python scripts/make_sample_data.py` (regenerate the dashboard's sample-data).
2. `pytest -q tests/test_static_data.py tests/test_store_report.py` plus any test that pins a finding's
   title/id/count. If you add or remove a finding, update the per-template count in
   `test_static_data.py` and finding lists in the report tests.

This engine is for the **URL assessment** demo. For the VS Code **source scan**, see [[scanner-finding]].
