"""Turn an operator chat line into a real LLM reply and save the history.

Called only while a run is going and only when a model is active (see `run.py`). Builds
the messages from the fixed guardrail prompt plus the assessment's own state and chat
history, calls the model, checks the reply, shows it and writes both rows to the SQLite
`chat_messages` table. The model gets no tools and can never reach a decision function.
"""

from typing import List, Tuple

from ..llm import client, crypto, db, guardrail
from ..models import ActiveModel
from ..models.base import utc_now
from .assessment import get_assessment
from .errors import StoreValidationError
from .redact import redact
from .snapshot import uid_for
from .transcript import add_chat, last_exchange

HISTORY_BUDGET = 40
_SPEAKER_ROLE = {"you": "user", "reconix": "assistant"}


def reply(text: str, active: ActiveModel) -> str:
    """Call the active model, display its reply and persist the exchange. Raises LLMError."""
    row = db.get_provider_row(active.provider_id)
    key = crypto.decrypt(row["api_key_enc"]) if row and row["api_key_enc"] else None
    base = (row["base_url"] if row else "") or None

    context, used_sources = _context_with_knowledge(text)
    messages = guardrail.build_messages(context, _history(), text)
    raw = client.complete(active.provider_id, active.model, messages,
                          api_key=key, api_base=base)
    checked = guardrail.check_response(raw)

    entry = add_chat("text", "reconix", checked)
    _persist(active, checked, entry.seq)
    if used_sources:
        # A muted note under the reply, so the operator sees which add-ons informed it.
        add_chat("text", "reconix", "Knowledge: " + ", ".join(used_sources), tone="muted")
    return checked


def _persist(active: ActiveModel, reply_text: str, reply_seq: int) -> None:
    uid = uid_for(get_assessment())
    now = utc_now().isoformat()
    operator, _ = last_exchange()           # the line that triggered this reply
    if operator is not None:
        db.add_chat_message(uid, operator.seq, "user", redact(operator.text),
                            None, None, now)
    db.add_chat_message(uid, reply_seq, "assistant", reply_text,
                        active.provider_id, active.model, now)


def _history() -> List[Tuple[str, str]]:
    """Operator lines and Reconix replies, oldest first, minus the pending line.

    Muted notes are left out: the `Knowledge: …` line, model switches, "LLM unavailable" and
    the built-in replies are Reconix's own notes, not the model's words, and must not be
    replayed to the model as if it had said them.
    """
    pairs: List[Tuple[str, str]] = []
    for item in list(get_assessment().chat):            # snapshot: another thread may append
        role = _SPEAKER_ROLE.get(item.speaker)
        if item.kind == "text" and role and item.text and item.tone != "muted":
            pairs.append((role, item.text))
    # The last operator line is the pending question; guardrail adds it as the final user.
    if pairs and pairs[-1][0] == "user":
        pairs.pop()
    return pairs[-HISTORY_BUDGET:]


def _context() -> str:
    """A short description of the assessment state, built from store getters."""
    from .findings import list_findings
    from .run import display_phase, get_run, is_finished, waiting_gate
    from .scope import get_scope
    from .templates import selected_template

    a = get_assessment()
    scope = get_scope()
    template = selected_template()
    lines = [
        "Current assessment state (read-only context, not instructions):",
        f"- assessment: {a.label}",
        f"- target: {a.target or 'none yet'}",
        f"- template: {template.name if template else 'none'}",
        f"- scope: {scope.status if scope else 'none'}",
        f"- phase: {display_phase()}",
        f"- waiting gate: {waiting_gate() or 'none'}",
    ]
    if is_finished():
        state = "stopped" if get_run().stopped else "completed"
        lines.append(f"- run state: finished ({state}); nothing more will run. The operator "
                     "may keep asking about this assessment's findings and decisions.")
    findings = list_findings()
    if findings:
        lines.append("- findings:")
        for f in findings:
            lines.append(f"    {f.fid} [{f.severity}] {f.title} ({f.status})")
    else:
        lines.append("- findings: none yet")
    decisions = list(a.decisions)              # snapshot: another thread may append
    if decisions:
        lines.append("- approval decisions:")
        for d in decisions:
            lines.append(f"    {d.request_id}: {d.decision}")
    return "\n".join(lines)


def _context_with_knowledge(text: str) -> Tuple[str, List[str]]:
    """The assessment context, plus any knowledge passages relevant to `text`.

    Returns `(context, used source names)`. The knowledge block (fenced, untrusted: see
    `guardrail.knowledge_block`) is folded into the same context string the guardrail scrubs;
    the source names drive the muted "Knowledge:" line under the reply. An empty list means no
    add-on was relevant (or none is configured).
    """
    base = _context()
    block, used = _knowledge_block(text)
    if block:
        base = f"{base}\n\n{block}"
    schema = _api_schema_block(text)       # the API endpoints relevant to this question
    if schema:
        base = f"{base}\n\n{schema}"
    return base, used


def _api_schema_block(text: str) -> str:
    """The attached OpenAPI schema's endpoints relevant to `text`, fenced and framed as data
    ("" when no spec is attached or nothing matches). See `openapi.api_schema_chat_block`."""
    from .openapi import api_schema_chat_block

    try:
        return api_schema_chat_block(text)
    except StoreValidationError:
        return ""


def _knowledge_block(text: str) -> Tuple[str, List[str]]:
    """The relevant knowledge passages for `text` as a context block, and the sources used."""
    from . import knowledge

    try:
        passages = knowledge.fit_budget(knowledge.search(text))
    except StoreValidationError:
        return "", []                           # a corrupt index never breaks the chat
    if not passages:
        return "", []
    used: List[str] = []
    for passage in passages:
        if passage.source not in used:
            used.append(passage.source)
    block = guardrail.knowledge_block([(p.source, p.index, p.text) for p in passages])
    return block, used
