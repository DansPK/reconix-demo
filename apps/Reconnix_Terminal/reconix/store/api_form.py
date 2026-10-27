"""The API template's form: the API base URL and an optional OpenAPI spec, saved together.

Only while the API scope is a draft waiting for approval. The base URL is validated with the
same rules as a typed target; a different one re-drafts the scope for the new target (the
manifest the operator approves shows it). The spec, a file path or a URL on the API's own
host, is read and checked against the new target before anything changes, so a refused base
URL or spec leaves the draft exactly as it was.

Behaviour decided for the form (see `docs/API_TEMPLATE_FORM_PLAN.md`):
- An empty spec field keeps what is attached (Remove stays in the Scope menu).
- A new target keeps the operator's draft (methods, paths, ports, tools, time limit) and
  re-checks an attached spec: one that names servers, none of them on the new target, is
  removed with a notice; otherwise its servers are sorted again. Its endpoints are paths
  under the target, so keeping them never widens the scope.
"""

from ..models import ApiFormResult
from ..models.parser import ParsedTarget
from . import openapi
from .activity import log_event
from .errors import StoreValidationError
from .targets import check_target
from .transcript import add_activity, add_chat


def _retarget(assessment, parsed: ParsedTarget) -> str:
    """Point the draft at the new target and rebuild what the template derives from it.
    Returns the name of a spec removed because it is about another host, else ""."""
    from .run import _client_label
    from .templates import MODULES

    old = assessment.scope.target_url
    assessment.target = parsed.target
    assessment.target_url = parsed.target_url
    assessment.client = _client_label(parsed.target)
    assessment.scope.target_url = parsed.target_url
    dropped = ""
    if not openapi.recheck_spec_servers(assessment):
        dropped = openapi.detach_spec(assessment)
    bundle = MODULES[assessment.selected_template].build_run(assessment)
    assessment.approvals = bundle.approvals
    assessment.findings = bundle.findings
    assessment.login_2fa = bundle.login_2fa
    openapi._refresh_run(assessment)              # the steps after the gate, plan, methodology
    add_activity("USER", f"API base URL changed: {old} → {parsed.target_url}", tone="ok")
    log_event("scope.retargeted", f"{old} -> {parsed.target_url}")
    note = f"The draft scope now targets {parsed.target_url}. Review it before you approve."
    if dropped:
        note += (f" The OpenAPI spec {dropped} was removed: its servers are not on "
                 f"{parsed.target}.")
        add_activity("POLICY", "OpenAPI spec removed: its servers are on another host",
                     tone="warn")
        log_event("api_spec.removed", f"{dropped} (target changed)")
    add_chat("text", "reconix", note, tone="ok")
    return dropped


def save_api_form(base_url: str, spec_text: str = "") -> ApiFormResult:
    """Save the API template's form: re-target the draft scope and/or attach a spec.

    Raises StoreValidationError (and changes nothing) when the scope is not an API draft
    waiting for approval, the base URL is not a valid API target, or the spec can't be read
    (`openapi.load_spec`: a file, or a URL on the target's host — it may download, so call it
    off the UI thread).
    """
    assessment = openapi._draft_api_assessment()
    parsed = check_target("api", base_url or "")
    changed = parsed.target_url != assessment.scope.target_url
    loaded = None
    if (spec_text or "").strip():
        loaded = openapi.load_spec(spec_text, parsed.target_url)
        if openapi._draft_api_assessment() is not assessment:     # changed during a download
            raise StoreValidationError("The assessment changed while the spec was read.")
    dropped = _retarget(assessment, parsed) if changed else ""
    if loaded is not None:
        openapi.attach_document(assessment, *loaded)
    return ApiFormResult(target_url=assessment.scope.target_url, target_changed=changed,
                         spec=openapi.get_api_spec(), spec_attached=loaded is not None,
                         spec_dropped=dropped)


__all__ = ["save_api_form"]
