"""Reads a line typed on "Type something." at the Scope or Plan step: local rules, no model.

`ask_edit_intent` returns an ANSWER, a SCOPE_EDIT or a PLAN_EDIT and changes nothing. It fails
closed: one word it can't place and the whole line is answered, never half applied. What it
proposes is validated again by the store (`scope_edit_ai`, `plan_edit`).
"""

import re
from typing import Dict, List, Optional, Union

from ..models import EditIntent, ScopeChanges, ScopeManifest
from . import lists
from .plan_order import wants_plan_reorder
from .replies import (
    NOTHING_WAITS, NOTHING_YET, QUESTION_WORDS, asks_about_decision, small_talk, wants_decision,
    wants_view,
)
from .scope import HTTP_METHODS
from .scope_view import describe_scope, join_and
from .tools import known_tools

EXAMPLES = {
    "web_url": "add sqlmap · remove ffuf · exclude /checkout · only GET · time limit 30 minutes "
               "· change target to <url>",
    "api": "remove ffuf · exclude /v1/auth · only GET · time limit 30 minutes "
           "· change target to <url>",
    "network": "add port 8444 · remove port 23 · exclude 10.0.0.5 · remove Nuclei "
               "· time limit 30 minutes",
    "source": "exclude tests · include vendor · remove gitleaks · time limit 30 minutes",
}

_POLITE = re.compile(r"^(?:(?:please|can you|could you|would you|will you)\s+)+", re.IGNORECASE)
_ASKS = re.compile(r"^(?:do (?:you|we|i|they|these|the tools)|who|where|"
                   + "|".join(w for w in QUESTION_WORDS if w != "do") + r")\b", re.IGNORECASE)
# The value runs to the next space: what it holds is the store's to check.
_TARGET = re.compile(
    r"\b(?:(?:change|set|switch|move|point|update|make)\s+(?:the\s+|our\s+|my\s+)?target"
    r"(?:\s+(?:url|host))?|retarget|target)(?:\s+(?:it|this))?\s*(?:\bto\b|\bis\b|=|:)\s*"
    r"(?P<a>\S+)|\b(?:test|scan|assess)\s+(?P<b>\S+)\s+instead\b", re.IGNORECASE)
_TARGETISH = re.compile(r"[.:\d-]|^localhost$", re.IGNORECASE)
_NO_LIMIT = re.compile(r"\b(?:no|without|remove|drop|clear)\s+(?:the\s+|a\s+)?time[ -]limit\b",
                       re.IGNORECASE)
_HOURS = r"(?:hours?|hrs?|h)"
_MINUTES = r"(?:minutes?|mins?|m)"
_LIMIT = re.compile(
    r"\b(?:(?:set|change|make|add|keep)\s+)?(?:the\s+|a\s+)?time[ -]limit\s*(?:of|to|is|=|:)?\s*"
    rf"(?P<n1>-?\d+(?:\.\d+)?)\s*(?P<u1>{_HOURS}|{_MINUTES})?(?![\w.])"
    rf"|\b(?:limit|cap)\s+(?:it\s+|the\s+run\s+|testing\s+)?(?:to\s+)?"
    rf"(?P<n2>-?\d+(?:\.\d+)?)\s*(?P<u2>{_HOURS}|{_MINUTES})\b", re.IGNORECASE)
_FOCUS = re.compile(r"\b(?:focus|priorit\w+|emphasi\w+|concentrate|first|start with|begin with|"
                    r"matters? most|re-?draft|re-?plan)\b", re.IGNORECASE)
_PLAN_NOUN = re.compile(r"\b(?:plan|steps?|phases?|stages?|\d{1,2}[a-z])\b", re.IGNORECASE)

# What a verb does with the items after it.
VERBS = {
    "add": "add allow open include enable use",
    "remove": "remove drop disable disallow close delete without no",
    "exclude": "exclude skip avoid ignore block",
    "only": "only",
    "set": "set change limit",
}
_VERB_OF = {word: kind for kind, words in VERBS.items() for word in words.split()}
# "change nikto to dalfox" is a swap, not a list: only a named list may be set.
_SETS = re.compile(r"\b(?:set|change|limit)\s+(?:the\s+|it\s+)?(?:allowed\s+)?"
                   r"(?:tools?|ports?|methods?|requests?)?\s*(?:\bto\b|=|:)", re.IGNORECASE)
_RANGE = re.compile(r"\d+\s+to\s+\d+")
_EXCLUDE_PHRASE = re.compile(
    r"\b(?:(?:don'?t|do not|never)\s+(?:touch|test|scan|hit|crawl|visit|attack|use)"
    r"|stay (?:out of|away from)|keep out of|leave out)(?:\s+with)?\b", re.IGNORECASE)
_FILLER = set(
    "a an the to from and also please just with in on our my this that of for it its then too "
    "as well port ports tool tools path paths scope scan scans scanning scanner host hosts "
    "method methods request requests http excluded exclusion exclusions list allowed folder "
    "folders file files directory now keep run tests testing".split())
_LOWER_METHODS = re.compile(r"\b(?:get|head|post|put|patch|options)\b")
_EDGE = ",;:!?\"'“”()"


def _token_pattern() -> "re.Pattern":
    tools = sorted((re.escape(name) for name in known_tools()), key=len, reverse=True)
    verbs = sorted(_VERB_OF, key=len, reverse=True)
    return re.compile(
        r"(?P<net>\b\d+(?:\.\d+){3}(?:/\d+)?(?::\d+)?)"
        r"|(?P<path>(?<!\S)/[^\s,;]*)"
        r"|(?P<method>(?<![\w/.-])(?:" + "|".join(HTTP_METHODS) + r")(?![\w/-]))"
        r"|(?P<tool>(?<![\w/.-])(?i:" + "|".join(tools) + r")(?![\w/-]))"
        r"|(?P<verb>(?<![\w/.-])(?i:" + "|".join(verbs) + r")(?![\w/-]))"
        r"|(?P<num>(?<![\w.-])-?\d+(?![\w-]|\.\d))"
        r"|(?P<word>[^\s,;&+]+)")


def ask_edit_intent(text: str, step: str) -> EditIntent:
    """What `text` (the masked line) means at `step` ("SCOPE" or "PLAN"). Changes nothing."""
    scope = lists.current().scope
    if scope is None:
        return EditIntent("ANSWER", "There is no scope to change yet.")
    line = " ".join(text.split())
    polite = _POLITE.sub("", line)
    if polite != line:
        polite = polite.rstrip("? ")            # "can you add nikto?" asks for the change
    if polite.endswith("?") or _ASKS.match(polite) or wants_view(polite):
        return EditIntent("ANSWER", _answer(polite, step, scope))
    if wants_plan_reorder(polite):
        return EditIntent("PLAN_EDIT", plan_feedback=polite)
    read = _read_scope(polite, scope)
    if isinstance(read, ScopeChanges):
        return EditIntent("SCOPE_EDIT", scope_changes=read)
    if _FOCUS.search(polite):
        return EditIntent("PLAN_EDIT", plan_feedback=polite)
    verbs = set(re.findall(r"[a-z]+", polite.lower())) & set(_VERB_OF)
    if wants_decision(polite) and not verbs:
        waits = lists.current().run.waiting_gate
        return EditIntent("ANSWER", NOTHING_YET if waits else NOTHING_WAITS)
    if _PLAN_NOUN.search(polite):
        return EditIntent("PLAN_EDIT", plan_feedback=polite)
    small = small_talk(polite)
    if small:
        return EditIntent("ANSWER", small)
    why = f"I couldn't read “{read}” as a change" if read else "I couldn't read that as a change"
    return EditIntent("ANSWER", f"{why}, so nothing changed. {_help(step, scope)}")


def _help(step: str, scope: ScopeManifest) -> str:
    plan = " For the plan: focus on TLS first · move 3b before 3a." if step == "PLAN" else ""
    return f"Try: {EXAMPLES.get(scope.kind, EXAMPLES['web_url'])}.{plan}"


# --- a scope change ------------------------------------------------------------------------
def _read_scope(line: str, scope: ScopeManifest) -> Union[ScopeChanges, str]:
    """The ScopeChanges in `line`, or the words it couldn't place ("" when it names no change
    at all). Never a part of the line: one unread word refuses it all."""
    target = None
    found = _TARGET.search(line)
    if found:
        target = (found["a"] or found["b"]).rstrip(".,;!")
        if not _TARGETISH.search(target):
            return target
        line = f"{line[:found.start()]} {line[found.end():]}"
    minutes: Optional[int] = None
    if _NO_LIMIT.search(line):
        minutes = 0
        line = _NO_LIMIT.sub(" ", line)
    limit = _LIMIT.search(line)
    if limit:
        amount = float(limit["n1"] or limit["n2"])
        if (limit["u1"] or limit["u2"] or "").lower().startswith("h"):
            amount *= 60
        if minutes is not None or not amount.is_integer():
            return limit.group(0)
        minutes = int(amount)
        line = f"{line[:limit.start()]} {line[limit.end():]}"
    items = _items(line, scope)
    changes = items if isinstance(items, str) else _changes(items, scope)
    if isinstance(changes, str):
        return changes
    if target is None and minutes is None and not any(changes.values()):
        return ""
    return ScopeChanges(target=target, time_limit_minutes=minutes, **changes)


def _items(line: str, scope: ScopeManifest) -> Union[list, str]:
    """(verb word, kind, value) for every item in the line, or the words it couldn't place."""
    span = _RANGE.search(line)
    if span:
        return span.group(0)
    if re.search(r"\bmethods?\b", line, re.IGNORECASE):
        line = _LOWER_METHODS.sub(lambda m: m.group(0).upper(), line)
    line = _EXCLUDE_PHRASE.sub("exclude", line)
    tools = known_tools()
    excluded = {path.casefold(): path for path in scope.excluded_paths}
    says_port = bool(re.search(r"\bports?\b", line, re.IGNORECASE))
    out, unread = [], []
    verb, fresh = "", False           # fresh: the verb has no item yet
    for token in _token_pattern().finditer(line):
        kind, value = token.lastgroup, token.group(0)
        if kind == "verb":
            # "only allow GET" and "allow only GET" are one verb: only
            if not (fresh and verb == "only" and _VERB_OF[value.lower()] == "add"):
                verb = value.lower()
            fresh = True
            continue
        item: Union[str, int] = value
        if kind == "word":
            word = value.lstrip(_EDGE).rstrip(_EDGE + ".")
            if verb and word.casefold() in excluded:
                kind, item = "path", excluded[word.casefold()]
            elif (word.casefold() == "tests" and scope.kind == "source"
                  and _VERB_OF.get(verb) == "exclude"):
                kind, item = "path", word       # here a folder name, elsewhere a filler word
            elif not word or word.casefold() in _FILLER:
                continue
            elif scope.kind == "source" and _VERB_OF.get(verb) == "exclude":
                kind, item = "path", word
            else:
                unread.append(value)
                continue
        elif kind == "num" and (says_port or scope.kind == "network"):
            kind, item = "port", int(value)
        elif kind == "tool":
            item = tools[value.lower()]
        elif kind == "path" or (kind == "net" and scope.kind == "network"):
            kind, item = "path", value.rstrip(".!?:") or value
        elif kind != "method":
            unread.append(value)
            continue
        if not verb:
            unread.append(value)
            continue
        fresh = False
        out.append((verb, kind, item))
    if unread:
        return " ".join(unread)
    if any(_VERB_OF[verb] == "set" for verb, _, _ in out) and not _SETS.search(line):
        return line.strip()
    return out


def _changes(items: list, scope: ScopeManifest) -> Union[Dict[str, object], str]:
    """The items as ScopeChanges fields, or what is ambiguous about them."""
    out: Dict[str, list] = {key: [] for key in (
        "add_tools", "remove_tools", "add_ports", "remove_ports", "add_excluded",
        "remove_excluded")}
    methods: Optional[List[str]] = None
    only: Dict[str, list] = {"tool": [], "port": [], "method": []}
    for word, kind, value in items:
        verb = _VERB_OF[word]
        if kind == "path":
            if verb == "exclude":
                out["add_excluded"].append(value)
            elif word in ("allow", "open", "include"):
                out["remove_excluded"].append(value)
            else:
                return f"{word} {value} (say “exclude {value}” or “allow {value}”)"
        elif verb in ("only", "set"):
            only[kind].append(value)
        elif kind == "method":
            methods = list(scope.allowed_methods) if methods is None else methods
            if verb == "add":
                methods.append(value)
            else:
                methods = [m for m in methods if m != value]
        else:
            out[f"{'add' if verb == 'add' else 'remove'}_{kind}s"].append(value)
    if only["method"] and methods is not None:
        return "those methods"
    for kind, have in (("tool", scope.tools), ("port", scope.allowed_ports)):
        added, removed = out[f"add_{kind}s"], out[f"remove_{kind}s"]
        if [v for v in added if v in removed] or (only[kind] and (added or removed)):
            return f"those {kind}s"
        if only[kind]:
            keep = {str(v).casefold() for v in only[kind]}
            removed += [v for v in have if str(v).casefold() not in keep]
            added += only[kind]
    both = [p for p in out["add_excluded"] if p in out["remove_excluded"]]
    if both:
        return both[0]
    return {**out, "allowed_methods": only["method"] or methods}


# --- questions -----------------------------------------------------------------------------
TOOL_WORDS = {
    "nmap": "finds live hosts, open ports and the services behind them",
    "Nuclei": "checks for known vulnerabilities and misconfigurations",
    "nikto": "looks for outdated server software and dangerous files",
    "ffuf": "looks for pages and parameters that are not linked",
    "Katana": "crawls the pages and endpoints the target links to",
    "httpx": "checks which addresses answer and how",
    "whatweb": "identifies the technology the target runs on",
    "testssl.sh": "checks the TLS versions and ciphers on offer",
    "dalfox": "checks whether reflected input can become cross-site scripting",
    "schemathesis": "tests API endpoints against their schema",
    "Semgrep": "reviews the code for insecure patterns",
    "gitleaks": "looks for leaked passwords and keys",
    "trivy": "checks dependencies for known vulnerabilities",
}


def _answer(line: str, step: str, scope: ScopeManifest) -> str:
    """A scripted answer from the scope and plan as they stand. It changes nothing."""
    from .parser import extract_tools

    def has(*words: str) -> bool:
        return any(re.search(rf"\b{word}", line, re.IGNORECASE) for word in words)

    view = wants_view(line)
    tool = next(iter(extract_tools(line)), "")
    if view == "scope":
        return f"{describe_scope(scope).headline} It uses {join_and(scope.tools)}."
    if asks_about_decision(line) and has("approve", "accept", "reject", "confirm"):
        return f"That is yours to decide. {NOTHING_YET}"
    if tool:
        does = f"{tool} {TOOL_WORDS[tool]}; it" if tool in TOOL_WORDS else tool
        return f"{does} is {'' if tool in scope.tools else 'not '}in this scope."
    if has("exclu", "never", "off.limits", "avoid"):
        return (f"This scope never touches {join_and(scope.excluded_paths)}."
                if scope.excluded_paths else "Nothing is excluded from this scope.")
    if has("ports?\\b"):
        return (f"The scope allows ports {join_and(scope.allowed_ports)}." if scope.allowed_ports
                else "This scope has no port list; the port is part of its target URL.")
    if has("methods?\\b"):
        return f"Only {join_and(scope.allowed_methods)} requests are allowed."
    if has("time", "how long", "limit"):
        return (f"The time limit is {scope.time_limit_minutes} minutes."
                if scope.time_limit_minutes else "This scope has no time limit.")
    if has("risk", "safe", "danger", "approv"):
        gated = len(lists.current().approvals)
        steps = ("1 planned step stops and asks" if gated == 1
                 else f"{gated} planned steps stop and ask")
        return (f"{steps} for your approval. The policy engine checks every request against "
                "the approved scope.")
    if has("target\\b", "host\\b", "url\\b"):
        return f"The target is {scope.target_url}."
    if view == "plan" or has("plan\\b", "steps?\\b", "first\\b", "runs?\\b", "next\\b"):
        labels = [task.label for task in lists.current().plan]
        return f"The plan, in order: {join_and(labels)}. Nothing runs before you choose Run plan."
    if has("tools?\\b", "scan", "uses?\\b", "scope\\b"):
        return f"{describe_scope(scope).headline} It uses {join_and(scope.tools)}."
    return ("Nothing changed. I can answer questions about this scope and plan, or change them. "
            + _help(step, scope))


__all__ = ["ask_edit_intent"]
