"""Errors raised by store functions when input fails validation.

The in-memory store stands in for the backend, so it validates every write.
An API-backed store should raise the same error for a 422 response.
"""


class StoreValidationError(ValueError):
    """The request was rejected; the message is safe to show to the operator."""
