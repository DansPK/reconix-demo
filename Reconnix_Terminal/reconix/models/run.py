"""An assessment run: the scripted steps it plays and the state it is in."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Tuple

# The phase bars on the status panel, in order.
PROGRESS_BARS: Tuple[str, ...] = ("discovery", "scanning", "validation", "analysis", "report")

# Gates the run stops at until a human decides. Approval gates are "approval:<request id>".
GATE_TEMPLATE = "template"
GATE_SCOPE = "scope"
GATE_PLAN = "plan"
GATE_ACCOUNT = "account"          # the target login the tools need (cookie or test account)
GATE_CODE = "code"                # the one-time code, asked on its own after the password
GATE_APPROVAL_PREFIX = "approval:"


@dataclass(frozen=True)
class RunStep:
    """One scripted step. Which fields matter depends on `kind`:

    say       speaker, text, tone, entry ("text" | "banner" | "check")
    card      speaker, text (title), rows
    log       source, text, tone
    phase     name (a phase id, e.g. "testing")
    parse     the AI has identified the target
    progress  name (a bar from PROGRESS_BARS), value (percent)
    requests  value (requests sent since the last step)
    propose   method, path: the AI proposes a request; the policy check decides
    reveal    name (a finding id)
    gate      name (GATE_* or an approval gate)
    complete  the assessment is finished

    `pause` is the delay in seconds before the step plays (the controller scales it).
    `when` makes a step conditional: "login" plays only if the approved tools need a
    target login, "code" only if that login is followed by a one-time code.
    `tool` (say, card, log) is the tool `$tool` names in the text; when the approved scope
    dropped it, the run names an approved tool instead (`store.tools.approved_tool`).
    """

    kind: str
    speaker: str = ""
    text: str = ""
    tone: str = "default"
    entry: str = "text"
    source: str = ""
    rows: Tuple[Tuple[str, str], ...] = ()
    name: str = ""
    value: int = 0
    method: str = ""
    path: str = ""
    pause: float = 0.6
    when: str = ""             # "" (always) | "login" | "code"
    tool: str = ""             # the tool `$tool` stands for in the text


@dataclass
class PlanTask:
    """One item in the assessment plan shown on the dashboard.

    `key` is the progress bar it tracks (a member of PROGRESS_BARS); `label` is the
    template-specific name shown to the operator. `status` is derived live from the run:
    "pending" (not started), "active" (loading), or "done".
    """

    key: str
    label: str
    status: str = "pending"


@dataclass
class PlanRow:
    """One row of the plan the operator reviews before running it.

    A phase task ("1"), the target login it may need ("2a"), or a gated action under
    validation ("3a"). `gate` is "auto" (runs on its own), "login" or "approve";
    `status` is "pending", "active" (running, or waiting for you), "done" or "rejected".
    """

    num: str
    label: str
    detail: str
    risk: str              # LOW | MEDIUM | HIGH
    gate: str
    status: str = "pending"
    command: str = ""      # the exact request, for a gated action


@dataclass
class RunState:
    started: bool = False
    phase: str = "planning"
    cursor: int = 0                     # index of the next step to play
    target_known: bool = False
    waiting_gate: str = ""              # gate the run is stopped at, "" when moving
    stopped: str = ""                   # why the run stopped early, "" otherwise
    stopped_at_gate: str = ""           # the login / code gate a stopped run was waiting at
    completed: bool = False
    plan_started: bool = False           # the operator ran the reviewed plan
    started_at: Optional[datetime] = None    # when testing began (scope approved)
    finished_at: Optional[datetime] = None
    requests: int = 0
    authenticated: bool = False          # the target login was provided when a step needed it
    code_verified: bool = False          # the one-time code after it was accepted (never kept)
    progress: Dict[str, int] = field(default_factory=dict)
    revealed: List[str] = field(default_factory=list)   # finding ids shown so far
    report_path: str = ""
