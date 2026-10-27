---
name: wire-backend
description: Procedure for replacing one in-memory store resource (reconix/store/) with a real Reconix FastAPI endpoint, using a layered api/models/store structure, async workers, backend validation, and a mock fallback. Use when connecting any screen to the backend.
---

# Wire one data source to the backend

Do one resource at a time (scope, plan, approval, execution, findings, report).

## 1. Plan
Write down, before coding:
- Endpoint, method, auth requirement, and the role(s) allowed.
- Request and response JSON shape, and the model it maps to.
- Which screens consume it, and what they show while loading or on error.
- Which validation the backend performs (the UI never replaces it).

## 2. Layers (create if missing)

| Layer | File | Responsibility |
|-------|------|----------------|
| config | `reconix/config.py` | `RECONIX_API_URL`, `RECONIX_TOKEN`, `RECONIX_MOCK` from env |
| client | `reconix/api/client.py` | one `httpx.AsyncClient`, timeouts, bearer header, raises typed errors |
| errors | `reconix/api/errors.py` | `ApiError`, `AuthError` (401), `ForbiddenError` (403), `ValidationError` (422) |
| endpoint | `reconix/api/endpoints/<resource>.py` | thin functions: path, params, return JSON |
| model | `reconix/models/<resource>.py` | exists already; keep the fields screens use |
| store | `reconix/store/<resource>.py` | exists already; calls the endpoint, or keeps the in-memory list body when `RECONIX_MOCK=1`; returns models |

## 3. Load in the screen with a worker

```python
from textual import work

from ..api.errors import ApiError, ForbiddenError
from ..store import findings as findings_store

class FindingsListScreen(ReconixScreen):
    def on_mount(self) -> None:
        self.load_findings()

    @work(exclusive=True)
    async def load_findings(self) -> None:
        try:
            findings = await findings_store.list_findings()
        except ForbiddenError:
            self.notify("Your role cannot view findings.", severity="error")
            return
        except ApiError as exc:
            self.notify(f"Backend error: {exc}", severity="error")
            return
        self._populate(findings)
```

## 4. Security rules
- Approval: two calls. Request a confirmation (returns a single-use token), then
  POST the command hash **and** the token; the backend verifies both and the
  caller's role. Never mark a step approved locally.
- Execution starts only from a backend response confirming approval and scope.
- Escape backend and tool strings (`rich.markup.escape`) before rendering them as markup.
- Never log or display tokens.

## 5. Finish
- [ ] Add `httpx` to `requirements.txt` and `pyproject.toml` (and new packages to `[tool.setuptools] packages`).
- [ ] Mock mode still runs the full demo offline.
- [ ] Tests for success, 401/403/422, and network failure (mock `httpx`; no real network).
- [ ] Ask `security-reviewer` to check scope, approval, or auth changes.
