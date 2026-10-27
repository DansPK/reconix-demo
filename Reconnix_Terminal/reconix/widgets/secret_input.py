"""A masked Input whose text can't be copied or cut out (the test-account password)."""

from textual.widgets import Input


class SecretInput(Input):
    """Always masked; Ctrl+C / Ctrl+X do nothing, so the secret never reaches the clipboard."""

    def __init__(self, **kwargs) -> None:
        kwargs["password"] = True
        super().__init__(**kwargs)

    def action_copy(self) -> None:
        self.app.bell()

    def action_cut(self) -> None:
        self.app.bell()
