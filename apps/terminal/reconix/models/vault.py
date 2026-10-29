"""The session vault entries, and the Secret wrapper that keeps a value from leaking.

An entry holds whatever a target login needs — a session cookie, or an email/username
and password. One-time codes (OTP) are never stored, so they are not an entry kind.
"""

from dataclasses import dataclass, field
from datetime import datetime

from .base import utc_now

MASK = "••••••••"


class Secret:
    """A string that never shows itself.

    `repr()` and `str()` are masked, so the value can't leak through a log line, an
    f-string, `dataclasses.asdict()` or a traceback that prints local variables.
    Call `reveal()` only at the point the value is actually used.
    """

    __slots__ = ("_value",)

    def __init__(self, value: str) -> None:
        self._value = value

    def reveal(self) -> str:
        return self._value

    def __len__(self) -> int:
        return len(self._value)

    def __bool__(self) -> bool:
        return bool(self._value)

    def __repr__(self) -> str:
        return f"Secret({MASK!r})"

    __str__ = __repr__


@dataclass
class VaultEntry:
    """A credential kept in memory for this assessment's target login.

    `kind` is "cookie" (just `secret`) or "password" (`identity` = email/username +
    `secret` = password). Secrets are `Secret`, so they can't be printed.
    """

    __test__ = False   # not a pytest test class

    kind: str                         # "cookie" | "password"
    secret: Secret = field(repr=False, compare=False)
    identity: str = ""                # username or email, for "password"
    scope: str = ""                   # the host it may be used against
    label: str = ""                   # short description for the vault list
    created_at: datetime = field(default_factory=utc_now)


# Back-compat alias while older code/tests say TestAccount.
TestAccount = VaultEntry
