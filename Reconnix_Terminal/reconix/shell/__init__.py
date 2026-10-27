"""App-level behaviour split by concern; `ReconixApp` mixes these in.

navigation  the screen flow (←/→, 1–8, goto)
run_host    hosting the run controller and routing its gates to screens
actions     starting, deciding and leaving assessments
dialogs     pop-ups for commands: assessments, triage, import, exports, audit
web         /web: open the web dashboard, starting it first if it isn't running
"""

from .actions import ActionsMixin
from .agent import AgentMixin
from .dialogs import DialogsMixin
from .knowledge import KnowledgeMixin
from .llm import LlmMixin
from .navigation import FLOW, FLOW_ORDER, NavigationMixin
from .run_host import RunHostMixin
from .web import WebDashboardMixin

__all__ = ["ActionsMixin", "AgentMixin", "DialogsMixin", "KnowledgeMixin", "LlmMixin",
           "NavigationMixin", "RunHostMixin", "WebDashboardMixin", "FLOW", "FLOW_ORDER"]
