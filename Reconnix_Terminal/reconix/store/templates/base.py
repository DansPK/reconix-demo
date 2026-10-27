"""The template contract, and the generic run builder every template shares.

A template module describes its target in a `RunProfile`; `build_script()` turns that
into the standard phased run (Plan → Scope → Run plan → Test → [Authenticate] → Validate
→ Analyze → Report). The rhythm and the gates are the same for every template; only the content
differs, so all four behave consistently. The login steps are always in the script but
play only if the approved scope's tools need a login (see `store/tools.py`).
"""

from dataclasses import dataclass
from typing import List, Tuple

from ...models import (
    GATE_ACCOUNT, GATE_CODE, GATE_PLAN, GATE_SCOPE, GATE_TEMPLATE, ApprovalRequest, Finding,
    PlanTask, RunStep, ScopeManifest, Template,
)
from ...models.parser import ParsedTarget
from ..approvals import command_digest
from ..scenario import banner, card, check, gate, log, only, say

Row = Tuple[str, str]


def approval(request_id: str, *, risk: str, action: str, target: str, method: str, path: str,
             purpose: str, impact: str, command: str, param: str = "") -> ApprovalRequest:
    """An ApprovalRequest with its command hash filled in.

    With `param` ("Path", "Host:port", "File") the operator may edit `path` before deciding
    (`approvals.edit_approval`); `target` and `command` are then patterns where "{path}"
    stands for it, filled in here.
    """
    fill = (lambda pattern: pattern.replace("{path}", path)) if param else (lambda text: text)
    return ApprovalRequest(
        request_id=request_id, risk=risk, action=action, target=fill(target), method=method,
        path=path, purpose=purpose, impact=impact, command=fill(command),
        command_hash=command_digest(fill(command)), param_label=param,
        target_pattern=target if param else "", command_pattern=command if param else "",
    )


@dataclass
class RunProfile:
    """The template-specific content the generic builder weaves into a run."""

    target_kind: str                       # "web application", "network range", …
    tools: List[str]
    discovery_tool: str                    # "OWASP ZAP", "nmap", "httpx", …
    # Card titles may name "$tool" (the discovery or scan tool) or "$tools" (all approved).
    discovery_card: Tuple[str, Tuple[Row, ...]]
    discovery_requests: Tuple[int, ...]    # request bursts counted during discovery
    blocked: Tuple[str, str]               # (method, target) the policy engine will block
    scan_card: Tuple[str, Tuple[Row, ...]]
    scan_requests: Tuple[int, ...]
    candidate_note: str                    # chat line proposing validation
    candidate_log: str                     # activity: "Candidate F-001 · …"
    medium: ApprovalRequest
    high: ApprovalRequest
    findings: List[Finding]                # all findings, revealed through the run
    analysis_steps: Tuple[str, ...]
    login_area: str = "the signed-in area"  # what the tools test behind the target login
    login_2fa: bool = False                # the target asks for a one-time code after the password
    extra_discovery: Tuple[str, ...] = ()  # extra activity-log lines during discovery
    scan_tool: str = "Nuclei"
    plan: Tuple[Tuple[str, str], ...] = ()  # the plan shown on the dashboard: (progress key, label)
    methodology: Tuple[str, ...] = ()       # standards followed (shown on the report)


@dataclass
class RunBundle:
    scope: ScopeManifest
    script: List[RunStep]
    approvals: List[ApprovalRequest]
    findings: List[Finding]
    login_2fa: bool = False
    plan: List[PlanTask] = None   # the named plan tasks, in order (set from the profile)
    methodology: List[str] = None   # standards followed (set from the profile)


# Every template's plan tracks the same five phases, named for its kind of target. The
# labels differ per template; the keys are the progress bars the run drives.
DEFAULT_PLAN: Tuple[Tuple[str, str], ...] = (
    ("discovery", "Discovery"),
    ("scanning", "Scanning"),
    ("validation", "Validate findings"),
    ("analysis", "Analyze & correlate"),
    ("report", "Generate report"),
)


def make_plan(pairs: Tuple[Tuple[str, str], ...]) -> List[PlanTask]:
    """Build the ordered plan tasks (status starts pending; the run drives it)."""
    return [PlanTask(key, label) for key, label in (pairs or DEFAULT_PLAN)]


def _progress(bar: str, percent: int, requests: int = 0) -> List[RunStep]:
    steps = [RunStep("progress", name=bar, value=percent, pause=0.5)]
    if requests:
        steps.append(RunStep("requests", value=requests, pause=0.0))
    return steps


def _reveal(fid: str) -> RunStep:
    return RunStep("reveal", name=fid, pause=0.2)


def build_plan(target_kind: str, ask_template: bool = True) -> List[RunStep]:
    """The first part of the run: identify the target and, if needed, ask for a template.

    It is built when the assessment starts. When the template is already known (the
    target left no doubt, or the operator picked it with /template) the rest of the run
    is appended at once; otherwise the operator picks (or changes) it at the gate and
    the rest is appended then. The Scope Manifest gate follows either way.
    """
    steps = [
        RunStep("parse", pause=0.8),
        log("AI", "Target parsed: $target"),
        say(f"Target identified: $target ({target_kind})."),
    ]
    if ask_template:
        steps += [say("Suggested template: $template. Opening templates…"), gate(GATE_TEMPLATE)]
    return steps


def build_rest(profile: RunProfile) -> List[RunStep]:
    """The run from scope approval to the report, filled from `profile`.

    Appended once the operator confirms a template, so the whole thing reflects the
    template they chose. Findings are revealed in order.
    """
    fids = [f.fid for f in profile.findings]
    first, rest = (fids[0] if fids else ""), fids[1:]
    blocked_method, blocked_target = profile.blocked
    disc_bursts = list(profile.discovery_requests) or [0]
    scan_bursts = list(profile.scan_requests) or [0]

    steps: List[RunStep] = [
        say("Template $picked: $template. Drafting a Scope Manifest…", tone="ok"),
        log("AI", "Scope Manifest drafted · pending approval", tone="warn", pause=1.0),
        say("Draft Scope Manifest ready. Testing stays paused until you approve it."),
        gate(GATE_SCOPE),

        # Run the plan
        say("Scope approved. Assessment $assessment created.", tone="ok"),
        say("Test plan ready. Review it, then run it; risky steps still ask you first.",
            pause=0.4),
        gate(GATE_PLAN),

        # Test
        say("Plan approved. Starting the permitted checks.", tone="ok", pause=0.4),
        RunStep("phase", name="testing", pause=0.0),
        say("Selected tools: $tools. Preparing requests with sample test data. Public "
            "surface first."),
        log("POLICY", "Scope check: passed", tone="ok"),
        log("TOOL", "Executing permitted scan · $tool", tool=profile.discovery_tool),
    ]
    steps += _progress("discovery", 45, disc_bursts[0])
    steps += [log("TOOL", line) for line in profile.extra_discovery]
    steps += _progress("discovery", 100, disc_bursts[min(1, len(disc_bursts) - 1)])
    steps.append(card(profile.discovery_card[0], *profile.discovery_card[1],
                      tool=profile.discovery_tool))

    steps += [log("TOOL", "$tool: checks on the permitted surface", tool=profile.scan_tool)]
    steps += _progress("scanning", 30, scan_bursts[0])
    steps.append(RunStep("propose", method=blocked_method, path=blocked_target, pause=0.8))
    steps.append(log("TOOL", "Continuing on permitted targets"))
    steps += _progress("scanning", 70, scan_bursts[min(1, len(scan_bursts) - 1)])
    steps.append(card(profile.scan_card[0], *profile.scan_card[1], tool=profile.scan_tool))

    # The target login the approved tools need ($login_need), then the code on its own
    steps += only(
        "login",
        log("AI", f"Login needed for {profile.login_area}: $login_need", tone="warn"),
        banner("Further testing requires a target login.", tone="warn"),
        gate(GATE_ACCOUNT),
    )
    steps += only(
        "code",
        log("TOOL", "Signing in with the test account…"),
        log("POLICY", "The target asked for a one-time code.", tone="warn"),
        gate(GATE_CODE),
    )
    steps += only(
        "login",
        say("Test session configured. Continuing within approved scope.", tone="muted"),
        log("POLICY", "Continuing within approved scope", tone="ok"),
    )
    steps += _progress("scanning", 100, scan_bursts[-1])

    # Validate
    steps.append(RunStep("phase", name="validating", pause=0.0))
    steps.append(say(profile.candidate_note))
    steps.append(log("AI", profile.candidate_log))
    if first:
        steps.append(_reveal(first))
    steps += _progress("validation", 20)
    steps.append(log("POLICY", "Risk: MEDIUM · approval required", tone="warn"))
    steps.append(gate(f"approval:{profile.medium.request_id}"))
    steps.append(banner("MEDIUM action approved by analyst.", tone="ok"))
    steps.append(log("TOOL", "Executing baseline request"))
    steps += _progress("validation", 45, 1)
    steps.append(log("POLICY", "Risk: HIGH · needs a double check", tone="warn"))
    steps.append(gate(f"approval:{profile.high.request_id}"))
    steps.append(banner("HIGH action approved after a double check.", tone="ok"))
    steps.append(log("TOOL", "Running limited validation · 1 request"))
    steps += _progress("validation", 100, 1)
    steps.append(say("Validation completed. Evidence recorded with sensitive values masked.",
                     tone="ok"))
    steps.append(log("AI", "Evidence recorded (masked)"))

    # Analyze
    steps.append(RunStep("phase", name="analyzing", pause=0.0))
    for i, text in enumerate(profile.analysis_steps):
        steps.append(check(text, first=(i == 0)))
        steps += _progress("analysis", min(100, 30 + i * 30))
    for fid in rest:
        steps.append(_reveal(fid))
    steps.append(log("AI", f"Duplicates merged · {len(fids)} unique findings"))
    steps += _progress("analysis", 100)

    # Done
    steps.append(log("SYS", "Assessment status: Completed", tone="ok", pause=0.6))
    steps.append(say("Assessment completed. $findings.", tone="ok", pause=0.3))
    steps.append(say("Open the report (8 or /report) to export it.", tone="muted",
                     pause=0.3))
    steps.append(RunStep("complete", pause=0.0))
    return steps


# A template module exposes these three names.
class TemplateModule:   # documentation only; modules are duck-typed
    SPEC: Template
    def build_scope(self, parsed: ParsedTarget) -> ScopeManifest: ...
    def build_run(self, assessment) -> RunBundle: ...
