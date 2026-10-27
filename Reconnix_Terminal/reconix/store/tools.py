"""What each testing tool needs to reach the part of a target behind a sign-in.

The run asks for one target login: the one that covers every tool in the approved scope.
A test account (email/username + password) covers the cookie tools too, because signing
in gives them a session. Tools not listed here need no login. A backend would read this
from its tool registry.
"""

from typing import Dict, List, Sequence, Tuple

# tool (lower case) -> "cookie" | "password"
TOOL_LOGIN: Dict[str, str] = {
    "owasp zap": "password",      # signs in through the target's login form
    "nuclei": "cookie",           # sends the session cookie with its checks
    "zap api scan": "cookie",
    "postman": "cookie",
}

# the stronger login covers the weaker one
LOGIN_RANK = ("", "cookie", "password")


def tool_login(tool: str) -> str:
    """The login `tool` needs: "" (none), "cookie" or "password"."""
    return TOOL_LOGIN.get(tool.strip().lower(), "")


def tools_login(tools: Sequence[str]) -> Tuple[str, List[str]]:
    """The one login covering `tools`, and the tools that need a login (in scope order)."""
    needs = [(tool, tool_login(tool)) for tool in tools]
    kind = max((login for _, login in needs), key=LOGIN_RANK.index, default="")
    return kind, [tool for tool, login in needs if login]


def approved_tool(preferred: str, tools: Sequence[str]) -> str:
    """`preferred` if the approved `tools` include it, else the first approved tool.

    Run text and findings name the template's usual tool; when the operator narrowed the
    scope to other tools, they name one the operator approved instead.
    """
    for tool in tools:
        if tool.strip().casefold() == preferred.strip().casefold():
            return tool
    return tools[0] if tools else preferred
