"""Assessment templates: each kind of target has its own defaults, scope and run.

A template module (`web_url`, `network`, `api`, `source`) exposes `SPEC` (catalog entry),
`build_scope(parsed)` and `build_run(assessment) -> RunBundle`. This package also holds the
store functions the UI calls to list templates and record the operator's choice; choosing
a template builds that template's scope, approvals and findings and appends its run steps.
"""

from dataclasses import replace
from typing import List, Optional

from ...models import GATE_SCOPE, GATE_TEMPLATE, RunStep, Template
from .. import lists
from ..activity import log_event
from ..errors import StoreValidationError
from ..scenario import log
from ..tools import approved_tool
from . import api, network, source, web_url
from .base import RunBundle

MODULES = {"web_url": web_url, "network": network, "api": api, "source": source}

# The order the Select-a-Template dialog shows them (matches the design video).
CATALOG_ORDER = ("network", "api", "source", "web_url")


def catalog() -> List[Template]:
    """The template catalog (store copies, with `suggested` set per the current target)."""
    suggested = lists.current().template_id
    return [replace(MODULES[tid].SPEC, suggested=(tid == suggested)) for tid in CATALOG_ORDER]


# --- the store functions the UI calls ---------------------------------------------------------
def list_templates() -> List[Template]:
    return catalog()


def get_template(template_id: str) -> Template:
    template = next((t for t in catalog() if t.id == template_id), None)
    if template is None:
        raise StoreValidationError(f"Unknown template {template_id}.")
    return template


def selected_template() -> Optional[Template]:
    chosen = lists.current().selected_template
    return next((t for t in catalog() if t.id == chosen), None) if chosen else None


def select_template(template_id: str) -> Template:
    """Record the operator's template and build the rest of the run from it.

    Only allowed while the run waits at the template gate. Choosing a template (the
    suggested one or another) builds its scope, approvals and findings and appends its
    steps, so the whole assessment reflects the chosen kind of target.
    """
    assessment = lists.current()
    if assessment.run.waiting_gate != GATE_TEMPLATE or assessment.selected_template:
        raise StoreValidationError("A template can only be chosen when Reconix asks for one.")
    return apply_template(template_id)


def apply_template(template_id: str, *, auto: bool = False) -> Template:
    """Use `template_id` for the current assessment: build its scope, approvals, findings
    and the rest of the run. Store-internal.

    Called by `select_template` at the gate, and by `start_run` when the template is
    already known: the operator picked it with /template, or (`auto`) the target's shape
    left no doubt. The Scope Manifest gate follows in every case.
    """
    if template_id not in MODULES:
        raise StoreValidationError(f"Unknown template {template_id}.")
    assessment = lists.current()
    if assessment.selected_template:
        raise StoreValidationError("This assessment already has a template.")
    spec = MODULES[template_id].SPEC

    assessment.selected_template = template_id
    assessment.template_id = template_id        # so $template shows the chosen one
    assessment.template_auto = auto
    bundle: RunBundle = MODULES[template_id].build_run(assessment)
    assessment.scope = bundle.scope
    assessment.approvals = bundle.approvals
    assessment.findings = bundle.findings
    assessment.login_2fa = bundle.login_2fa
    assessment.plan = bundle.plan or []
    assessment.methodology = bundle.methodology or []
    # The activity line is a step, so it plays after "Target parsed" (not before it).
    if auto:
        assessment.script.append(
            log("AI", f"Template auto-selected: {spec.name} (matched to the target)", pause=0.0))
        log_event("template.selected", f"{template_id} (auto)")
    else:
        assessment.script.append(log("USER", f"Template selected: {spec.name}", pause=0.0))
        log_event("template.selected", template_id)
    assessment.script.extend(_with_intent(assessment, bundle.script))
    return spec


def align_to_scope(assessment) -> None:
    """Fit the demo findings and approvals still to come to the scope just approved.

    The operator may have named or edited tools and ports before approving, and nothing has
    been revealed yet. Each template finding names an approved tool, and a template with its
    own `align_to_scope` (network: the approved ports) rebuilds its findings and approvals,
    command hashes included, before any is shown.
    Demo data only: a backend reports what its tools actually found.
    """
    module = MODULES.get(assessment.selected_template)
    rebuild = getattr(module, "align_to_scope", None)
    if rebuild is not None:
        rebuild(assessment)
    for finding in assessment.findings:
        finding.tool = approved_tool(finding.tool, assessment.scope.tools)


def _with_intent(assessment, script: List[RunStep]) -> List[RunStep]:
    """Prefill the draft scope with ports/tools the operator named, and note it before the
    scope gate. The operator still approves the manifest; this only fills the draft.

    Ports apply to a network scope (its `allowed_ports`); tools apply to any scope. When
    the line named neither, the template's own defaults stand unchanged.
    """
    scope = assessment.scope
    applied: List[str] = []
    if assessment.requested_tools:
        scope.tools = list(assessment.requested_tools)
        applied.append("tools " + ", ".join(scope.tools))
    if assessment.requested_ports and scope.kind == "network":
        scope.allowed_ports = list(assessment.requested_ports)
        applied.append("port " + ", ".join(str(p) for p in assessment.requested_ports))
    if not applied:
        return script
    note = log("AI", "From your request, the draft scope uses " + " and ".join(applied)
               + ". Review and approve it.", tone="warn", pause=0.6)
    gate_at = next((i for i, step in enumerate(script)
                    if step.kind == "gate" and step.name == GATE_SCOPE), len(script))
    return script[:gate_at] + [note] + script[gate_at:]


def template_name(template_id: str) -> str:
    spec = MODULES.get(template_id)
    return spec.SPEC.name if spec else "—"


__all__ = [
    "MODULES", "CATALOG_ORDER", "catalog", "list_templates", "get_template", "selected_template",
    "select_template", "apply_template", "template_name", "RunBundle",
]
