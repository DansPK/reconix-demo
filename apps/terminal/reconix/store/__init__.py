"""In-memory data store — the only thing screens import for data.

Every function here reads or writes the shared lists in `lists.py`. To move to
the Reconix backend later, keep these function names and signatures and change
their bodies to call the API; the screens do not need to change.
"""

from .activity import add_feedback, current_operator, list_events, list_feedback, log_event
from .api_form import save_api_form
from .approvals import (
    approvals_count, approve, can_edit, decision_for, decline_confirmation, edit_approval,
    get_approval, is_approved, list_approval_decisions, needs_confirmation, reject,
    request_confirmation,
)
from .assessment import (
    AssessmentCard, add_request, assessment_label, assessment_status, get_assessment,
    list_assessments, list_requests, switch_assessment,
)
from .errors import StoreValidationError
from .findings import (
    SEVERITY_ORDER, TRIAGE_LABELS, TRIAGE_STATUS, confirmed_count, findings_line, get_finding,
    list_findings, review_count, triage_finding,
)
from .findings_view import (
    FINDING_FILTERS, FINDING_SORTS, filter_counts, filter_label, find_findings, key_findings,
    severity_counts, sort_label,
)
from .history import add_history, list_history
from . import knowledge
from .knowledge import add_source, list_sources, remove_source
from .knowledge import clear as clear_knowledge
from .knowledge import search as search_knowledge
from .openapi import (
    api_schema_chat_block, api_schema_endpoint, api_schema_handoff, api_spec_handoff,
    api_spec_methods_outside, attach_api_spec, can_attach_api_spec, get_api_spec,
    remove_api_spec,
)
from .persist import autosave, close_session, web_dashboard_url
from .plan import gated_count, plan_overview
from .progress import step_states
from .providers import (
    activate, active_model, get_provider, list_providers, set_provider, test_provider,
    unset_provider,
)
from .report import (
    assessment_summary, generate_report, list_report_formats, list_report_sections,
    report_data,
)
from .retest import compare_findings, previous_assessment, retest, severity_trend
from .run import (
    advance, counters, display_phase, elapsed, gate_state, get_run, is_completed, is_finished,
    is_plan_started, llm_answer, new_assessment, peek, phase_progress, pipeline_stage,
    plan_tasks, reject_scope, run_plan, say_operator_line, say_to_assistant, start_run,
    stop_run, submit_prompt, time_limit, waiting_gate,
)
from .scope import (
    approve_scope, blocked_count, check_request, edit_scope, get_scope, is_scope_approved,
    list_verdicts,
)
from .scope_view import describe_scope
from .seed import DEMO_REQUEST, load_demo_data
from .targets import check_target
from .templates import get_template, list_templates, select_template, selected_template
from .transcript import last_exchange, list_activity, list_chat
from .tools import tool_login, tools_login
from .vault import (
    code_needed, current_auth_challenge, has_test_account, is_authenticated, is_code_verified,
    login_done, login_kind, login_tools, provide_auth, vault_scope,
)

load_demo_data()

reset = load_demo_data   # tests: restore the demo rows between runs

__all__ = [
    "StoreValidationError", "reset", "DEMO_REQUEST",
    # assessment and requests
    "get_assessment", "assessment_label", "list_requests", "add_request",
    "list_assessments", "switch_assessment", "assessment_status", "AssessmentCard",
    # the run
    "submit_prompt", "start_run", "check_target", "say_to_assistant", "say_operator_line",
    "llm_answer", "new_assessment",
    "advance", "peek", "gate_state", "stop_run",
    "waiting_gate", "get_run", "display_phase", "is_completed", "is_finished", "counters",
    "phase_progress", "plan_tasks", "plan_overview", "gated_count", "step_states",
    "pipeline_stage", "elapsed", "time_limit",
    # gates
    "list_templates", "get_template", "select_template", "selected_template",
    "get_scope", "approve_scope", "edit_scope", "is_scope_approved", "reject_scope",
    "describe_scope", "check_request", "run_plan", "is_plan_started",
    "list_verdicts", "blocked_count",
    "provide_auth", "current_auth_challenge", "has_test_account",
    "is_authenticated", "is_code_verified", "vault_scope",
    "login_kind", "login_tools", "login_done", "code_needed", "tool_login", "tools_login",
    "get_approval", "needs_confirmation", "request_confirmation", "decline_confirmation",
    "approve", "reject", "is_approved", "decision_for", "list_approval_decisions",
    "approvals_count", "can_edit", "edit_approval",
    # results
    "list_findings", "get_finding", "confirmed_count", "review_count",
    "findings_line", "SEVERITY_ORDER",
    "triage_finding", "TRIAGE_STATUS", "TRIAGE_LABELS",
    "FINDING_FILTERS", "FINDING_SORTS", "find_findings", "filter_counts", "filter_label",
    "sort_label", "severity_counts", "key_findings",
    "list_report_formats", "list_report_sections", "report_data", "generate_report",
    "assessment_summary",
    "retest", "severity_trend", "compare_findings", "previous_assessment",
    # transcript, audit, history
    "list_chat", "last_exchange", "list_activity",
    "current_operator", "log_event", "list_events", "add_feedback", "list_feedback",
    "add_history", "list_history",
    # the saved copy the web dashboard reads
    "autosave", "close_session", "web_dashboard_url",
    # the API template's OpenAPI spec
    "attach_api_spec", "remove_api_spec", "get_api_spec", "can_attach_api_spec", "save_api_form",
    "api_spec_handoff", "api_spec_methods_outside",
    "api_schema_handoff", "api_schema_chat_block", "api_schema_endpoint",
    # knowledge add-ons (/add-on): reference files for the AI
    "knowledge", "add_source", "list_sources", "remove_source",
    "clear_knowledge", "search_knowledge",
    # LLM providers and the active model
    "list_providers", "get_provider", "set_provider", "unset_provider", "test_provider",
    "activate", "active_model",
]
