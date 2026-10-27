"""The assessment aggregate: one assessment and everything it owns.

The in-memory store keeps a list of these (one per assessment in the session) and a
pointer to the current one. Every per-assessment collection lives here, so assessments
are isolated and a past one can be reopened unchanged. Session-wide trails (audit
events, prompt history, feedback) stay in `store.lists`, not here.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional

from .api_schema import ApiSchemaDigest
from .api_spec import ApiSpec
from .approval import ApprovalDecision, ApprovalRequest, Confirmation
from .base import utc_now
from .finding import Finding
from .run import PlanTask, RunState, RunStep
from .scope import PolicyVerdict, ScopeManifest
from .transcript import ActivityEntry, ChatEntry
from .vault import VaultEntry


@dataclass
class UserRequest:
    text: str
    created_at: datetime = field(default_factory=utc_now)


@dataclass
class Assessment:
    """One assessment and all of its state."""

    planned_id: str        # the id it gets once its scope is approved
    target: str            # host or URL as the operator gave it, e.g. "staging.example.com"
    target_url: str        # normalized, e.g. "https://staging.example.com"
    target_kind: str       # human label, e.g. "web application"
    operator: str
    template_id: str = ""  # the kind of target: web_url | network | api | source
    assessment_id: str = ""     # "" until the scope is approved
    created_at: datetime = field(default_factory=utc_now)

    # engagement metadata (shown on the report cover; set as the run is built)
    client: str = ""                    # the organization the assessment is for
    mode: str = "Grey-box, Authorized"  # the engagement type
    methodology: List[str] = field(default_factory=list)   # e.g. ["OWASP WSTG", …]
    report_version: str = "1.0"

    # per-assessment state
    scope: Optional[ScopeManifest] = None
    run: RunState = field(default_factory=RunState)
    script: List[RunStep] = field(default_factory=list)       # the steps the run plays
    plan: List[PlanTask] = field(default_factory=list)        # the named plan shown on screen
    selected_template: str = ""     # the template in use ("" until chosen or matched)
    template_auto: bool = False     # matched from an unambiguous target, not picked
    requested_ports: List[int] = field(default_factory=list)   # intent from the prompt
    requested_tools: List[str] = field(default_factory=list)   # intent from the prompt
    api_spec: Optional[ApiSpec] = None   # an OpenAPI file attached to an API scope draft
    # The schema digest built from that file, for the AI only. In memory, never saved,
    # never in the snapshot or a report; cleared/replaced with the spec (store/openapi.py).
    api_schema_digest: Optional[ApiSchemaDigest] = None
    login_2fa: bool = False         # the target asks for a one-time code after the password
    approvals: List[ApprovalRequest] = field(default_factory=list)
    decisions: List[ApprovalDecision] = field(default_factory=list)
    confirmations: List[Confirmation] = field(default_factory=list)
    verdicts: List[PolicyVerdict] = field(default_factory=list)
    findings: List[Finding] = field(default_factory=list)
    vault: List[VaultEntry] = field(default_factory=list)
    chat: List[ChatEntry] = field(default_factory=list)
    activity: List[ActivityEntry] = field(default_factory=list)
    requests: List[UserRequest] = field(default_factory=list)

    @property
    def label(self) -> str:
        """The id to show: the assigned id, else the planned one."""
        return self.assessment_id or self.planned_id
