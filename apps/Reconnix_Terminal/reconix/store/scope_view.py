"""The scope manifest in plain words: what the Template and Approval screens show a person.

The manifest itself (`models.ScopeManifest`) is what the policy engine enforces; this
module only words it. A backend would send the same summary next to the manifest.
"""

from typing import Dict, List, Sequence, Tuple

from ..models import ScopeManifest, ScopeSummary
from . import lists
from .tools import tools_login

# kind -> (verb, what the target is), for "Reconix will <verb> <target> as <what>."
KIND_WORDS: Dict[str, Tuple[str, str]] = {
    "web_url": ("test", "a web application"),
    "api": ("test", "an API"),
    "network": ("test", "a network"),
    "source": ("review", "source code"),
}

# allowed_actions (lower case) -> what that means for someone who doesn't test for a living
ACTION_WORDS: Dict[str, str] = {
    "discovery": "Discover pages and endpoints",
    "vulnerability scanning": "Scan for known vulnerabilities",
    "limited validation": "Carefully confirm what it finds",
    "endpoint discovery": "Discover the API's endpoints",
    "auth checks": "Check logins and who can access what",
    "host discovery": "Find which hosts are up",
    "port scan": "Check which ports are open",
    "service detection": "Identify the services behind open ports",
    "dependency scan": "Check dependencies for known vulnerabilities",
    "secret scan": "Look for leaked passwords and keys",
    "static analysis": "Review the code for insecure patterns",
}


def join_and(items: Sequence[object]) -> str:
    """'a', 'a and b', 'a, b and c'."""
    words = [str(i) for i in items]
    if len(words) <= 1:
        return "".join(words)
    return f"{', '.join(words[:-1])} and {words[-1]}"


def _action(action: str) -> str:
    return ACTION_WORDS.get(action.strip().lower(), action[:1].upper() + action[1:])


# the login the scope's tools need (see tools.py), as a "What it may do" line
LOGIN_LINES: Dict[str, str] = {
    "cookie": "Use a session cookie you give it",
    "password": "Sign in with a test account you give it",
    "password+otp": "Sign in with a test account you give it, then a one-time code",
}


def _login(scope: ScopeManifest) -> List[str]:
    """Which login the tools will ask for, and which tools need it ([] for none)."""
    kind, tools = tools_login(scope.tools)
    if not kind:
        return []
    if kind == "password" and lists.current().login_2fa:
        kind = "password+otp"
    return [f"{LOGIN_LINES[kind]} (for {join_and(tools)})"]


def _limits(scope: ScopeManifest) -> List[str]:
    """How it may reach the target: request methods, ports, or file access."""
    if scope.kind == "network":
        line = f"Only connect to ports {join_and(scope.allowed_ports)}" if scope.allowed_ports \
            else "Only connect to the hosts in range"
        return [f"{line}, using {join_and(scope.allowed_methods)}"]
    if scope.kind == "source":
        return [f"Only {join_and(scope.allowed_methods)} the files; nothing is run"]
    return [f"Send only {join_and(scope.allowed_methods)} requests"]


def describe_scope(scope: ScopeManifest) -> ScopeSummary:
    """The manifest as a headline and short lists. The time limit is left out on purpose."""
    verb, what = KIND_WORDS.get(scope.kind, ("test", scope.assessment_type))
    return ScopeSummary(
        headline=f"Reconix will {verb} {scope.target_url} as {what}.",
        may_do=[_action(a) for a in scope.allowed_actions] + _limits(scope) + _login(scope),
        never=list(scope.excluded_paths),
        tools=list(scope.tools),
    )
