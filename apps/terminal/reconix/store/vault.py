"""Target login: what the tools need, the challenge each step raises, storing what it returns.

The approved scope's tools decide the login (`tools.tools_login`): a session cookie, a
test account (email/username + password), or none. If the target asks for a one-time code
after the password, that's a second step on its own (`GATE_CODE`), right after the first.

Durable credentials are kept in memory as `Secret`s for this assessment only. A one-time
code is validated and used, but never stored. Nothing here reaches the chat, the activity
log, findings or reports.
"""

from typing import Dict, List, Optional, Union

from ..models import (
    GATE_ACCOUNT, GATE_CODE, Assessment, AuthChallenge, Secret, VaultEntry, challenge_for,
)
from . import lists
from .activity import log_event
from .errors import StoreValidationError
from .tools import tools_login
from .transcript import add_activity

MAX_IDENTITY_LENGTH = 64
MAX_SECRET_LENGTH = 4096
OTP_LENGTH = 6


# --- what the run needs ----------------------------------------------------------------------
def login_tools(assessment: Optional[Assessment] = None) -> List[str]:
    """The scope's tools that need a target login."""
    assessment = assessment or lists.current()
    return tools_login(assessment.scope.tools if assessment.scope else [])[1]


def login_kind(assessment: Optional[Assessment] = None) -> str:
    """The login the run asks for: "" (none), "cookie", "password" or "password+otp"
    (a test account, then a one-time code on its own)."""
    assessment = assessment or lists.current()
    kind = tools_login(assessment.scope.tools if assessment.scope else [])[0]
    return "password+otp" if kind == "password" and assessment.login_2fa else kind


def code_needed(assessment: Optional[Assessment] = None) -> bool:
    return login_kind(assessment) == "password+otp"


def login_done(assessment: Optional[Assessment] = None) -> bool:
    """Every login step the run needs has been given (True when it needs none)."""
    assessment = assessment or lists.current()
    kind = login_kind(assessment)
    if not kind:
        return True
    return assessment.run.authenticated and (kind != "password+otp"
                                             or assessment.run.code_verified)


def current_auth_challenge() -> Optional[AuthChallenge]:
    """The secure input to show: the one-time code while the run waits for it, else the
    login the tools need (None when they need none)."""
    kind = login_kind()
    if not kind:
        return None
    if lists.current().run.waiting_gate == GATE_CODE:
        return challenge_for("otp")
    return challenge_for("password" if kind == "password+otp" else kind)


# --- the operator gives it -------------------------------------------------------------------
def _as_secret(value: Union[Secret, str]) -> Secret:
    return value if isinstance(value, Secret) else Secret(value)


def _plain(value: Union[Secret, str]) -> str:
    return (value.reveal() if isinstance(value, Secret) else str(value)).strip()


def provide_auth(values: Dict[str, Union[Secret, str]]) -> None:
    """Validate and apply what the open login step asks for.

    `values` maps each challenge field id to its value (secrets may be `Secret`). At the
    login step the cookie or test account is stored for this assessment; at the code step
    the one-time code is checked and discarded. Each step is accepted once.
    """
    run = lists.current().run
    challenge = current_auth_challenge()
    if (run.waiting_gate == GATE_CODE and challenge is not None and run.authenticated
            and not run.code_verified):            # the code only ever follows the password
        code_field = next(field for field in challenge.fields if field.otp)
        _accept_code(values.get(code_field.id, ""))
        return
    if challenge is None or run.waiting_gate != GATE_ACCOUNT or run.authenticated:
        raise StoreValidationError("A login can only be added when Reconix asks for one.")

    identity = ""
    secret: Optional[Secret] = None
    for field in challenge.fields:
        raw = values.get(field.id, "")
        if field.secret:
            secret = _as_secret(raw)
            if not secret:
                raise StoreValidationError(f"Enter the {field.label.lower()}.")
            if len(secret) > MAX_SECRET_LENGTH:
                raise StoreValidationError(f"{field.label} is too long.")
        else:
            identity = _plain(raw)
            if not identity:
                raise StoreValidationError(f"Enter the {field.label.lower()}.")
            if len(identity) > MAX_IDENTITY_LENGTH or any(c.isspace() for c in identity):
                raise StoreValidationError(
                    f"{field.label} is one word, up to {MAX_IDENTITY_LENGTH} characters.")

    _store(challenge.kind, identity, secret)
    run.authenticated = True
    add_activity("USER", f"Target login stored ({challenge.kind})", tone="ok")
    log_event("vault.auth_provided", challenge.kind)


def _accept_code(raw: Union[Secret, str]) -> None:
    code = _plain(raw)
    if not (len(code) == OTP_LENGTH and code.isdigit()):
        raise StoreValidationError(f"The one-time code is {OTP_LENGTH} digits.")
    lists.current().run.code_verified = True                 # the code itself is dropped
    add_activity("USER", "One-time code accepted · used once, not stored", tone="ok")
    log_event("vault.code_accepted")


def _store(kind: str, identity: str, secret: Optional[Secret]) -> None:
    vault = lists.current().vault
    scope = lists.current().target
    if kind == "cookie":
        entry = VaultEntry(kind="cookie", secret=secret, scope=scope, label="session cookie")
    else:
        entry = VaultEntry(kind="password", identity=identity, secret=secret, scope=scope,
                           label=f"password · {identity}")
    vault.clear()
    vault.append(entry)


def has_test_account() -> bool:
    return bool(lists.current().vault)


def is_authenticated() -> bool:
    """The login step is done (a cookie or test account was given)."""
    return lists.current().run.authenticated


def is_code_verified() -> bool:
    return lists.current().run.code_verified


def vault_scope() -> str:
    """The host the stored credential may be used against ("" when there is none)."""
    vault = lists.current().vault
    return vault[-1].scope if vault else ""
