# Plan — HIGH risk without a reason; the login decided by the tools, 2FA on its own

2026-10-06. Classic UI (`classic-ui`). Changes the store (the backend seam), the Approval
screen, the login form flow, the sample data and the docs.

## Decisions (from the user)

- **HIGH risk: no typed reason, a double check.** "Approve & run" on a HIGH action opens
  the second confirmation ("Run this HIGH-risk step now?", defaulting to "No, go back").
  The store still requires the single-use token from `request_confirmation()` and the
  matching command hash; it no longer asks for or validates a reason.
  `ApprovalDecision.reason` stays in the model and the saved copy (older copies have
  one), and is empty from now on.
- **The login a run asks for comes from its tools.** Each tool declares what it needs to
  test behind a sign-in: a session cookie, a test account (email/username + password), or
  nothing. The run asks for the one login that covers every tool in the approved scope.
  A test account covers the cookie tools too, because signing in gives them a session.
  Editing the scope's tools changes the login, and with no such tool there's no login
  step at all.

  | Tool | Needs |
  |---|---|
  | OWASP ZAP | test account (signs in through the login form) |
  | Nuclei, ZAP API scan, Postman | session cookie |
  | nmap, testssl.sh, Semgrep, gitleaks, pip-audit | nothing |
  | anything else | nothing |

  So the defaults stay the same: Web URL → test account, API → cookie, Network/Source →
  none.
- **2FA is asked on its own, right after the password.** Whether the target asks for a
  one-time code is a property of the target (the template says so: the demo web target
  does). The first pop-up asks only for email + password. Reconix signs in, the target
  asks for the code, and a second pop-up asks only for the 6-digit code. The code is
  validated, used once and never stored. A cookie login never asks for a code.

## Store (backend seam)

- `models/run.py`: `GATE_CODE = "code"`; `RunStep.when` ("" | "login" | "code"): a step
  that plays only if the run needs a login / a one-time code; `RunState.code_verified`.
- `models/assessment.py`: `auth_kind` → `login_2fa` (the target asks for a code).
- `store/tools.py` (new): `TOOL_LOGIN`, `tools_login(tools) -> (kind, tools that need it)`.
- `store/vault.py`: `login_kind(assessment=None)` → "" | "cookie" | "password" |
  "password+otp"; `current_auth_challenge()` is the pop-up for the gate the run waits
  at (login fields, or only the code); `provide_auth()` serves both gates, once each.
- `store/run.py`: `peek()`/`advance()` skip steps whose `when` doesn't apply;
  `gate_state(GATE_ACCOUNT / GATE_CODE)` is open when not needed or provided; `$login`
  and `$login_tools` in step text.
- `store/approvals.py`: `approve(request_id, *, command_hash, confirmation_token=None)`.
- `templates/base.py`: the login steps are always in the script, marked `when`, so the
  approved tools decide at play time. `RunProfile.auth/auth_reason` →
  `login_2fa` + `login_area`.

## Screens

- Approval: no reason field; HIGH goes straight to the double check.
- LoginForm: unchanged contract (it shows the open challenge's fields). It's opened for
  both gates (`flow/gates.py`).
- Execution: "waiting for the one-time code" at the code gate.
- Scope summary and Plan: which login, for which tools, and "then a one-time code".

## Also

`snapshot.py` (`login.kind`, `provided` = all steps done, the code gate's wait text),
`progress.py`, `make_sample_data.py` (+ regenerate `web/sample-data`), the web policy page
text, CLAUDE.md's security rules, README, and the tests.
