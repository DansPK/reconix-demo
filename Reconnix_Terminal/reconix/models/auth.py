"""What a target login needs: the challenge a step raises and the fields it asks for.

The tools decide the login (a session cookie, or a test account: email/username and
password). If the target asks for a one-time code after the password, that's a separate
challenge, asked on its own right after. The one-time code is never stored.
"""

from dataclasses import dataclass
from typing import Tuple


@dataclass(frozen=True)
class AuthField:
    id: str
    label: str
    secret: bool = False       # masked input, kept out of the clipboard
    otp: bool = False          # a one-time code: validated, never stored
    placeholder: str = ""


@dataclass(frozen=True)
class AuthChallenge:
    kind: str                  # "cookie" | "password" | "otp"
    title: str                 # dialog heading, e.g. "SECURE INPUT · SESSION COOKIE"
    note: str                  # one line on what it is
    fields: Tuple[AuthField, ...]


IDENTITY = AuthField("identity", "Email or username", placeholder="test account")
PASSWORD = AuthField("secret", "Password", secret=True)
COOKIE = AuthField("secret", "Session cookie", secret=True, placeholder="name=value; …")
CODE = AuthField("code", "One-time code", otp=True, placeholder="6-digit code")

CHALLENGES = {
    "cookie": AuthChallenge(
        "cookie", "SECURE INPUT · SESSION COOKIE",
        "Paste the test session cookie. Kept in memory for this session only.",
        (COOKIE,)),
    "password": AuthChallenge(
        "password", "SECURE INPUT · TEST ACCOUNT",
        "Kept in memory for this session only. Never shown in chat, the log, or findings.",
        (IDENTITY, PASSWORD)),
    "otp": AuthChallenge(
        "otp", "SECURE INPUT · ONE-TIME CODE",
        "The target sent a one-time code. Enter it now: it is used once and never stored.",
        (CODE,)),
}


def challenge_for(kind: str) -> AuthChallenge:
    return CHALLENGES[kind]
