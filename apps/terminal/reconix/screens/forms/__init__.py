"""Pop-up forms with text inputs, built on the reusable `FormScreen`."""

from .add_on import AddOnForm
from .approval_edit import ApprovalEditForm
from .base import FormField, FormScreen
from .login import LoginForm
from .openapi_spec import OpenApiForm
from .provider import ProviderForm
from .scope_edit import ScopeEditForm

__all__ = ["AddOnForm", "ApprovalEditForm", "FormField", "FormScreen",
           "LoginForm", "OpenApiForm", "ProviderForm", "ScopeEditForm"]
