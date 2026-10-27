# Plan — Claude-Code-style start, plain-language scope

2026-10-06. Classic UI (`classic-ui`). No backend change: the store stays the seam.

## Decisions (from the user)

- **The logo goes after the first input.** An assessment with nothing typed yet keeps the
  logo, tagline and quickstart panel. Once the operator sends a line, the Start screen
  shows the conversation instead: their line on top, then Reconix's answer or one
  spinner line while it works. A new assessment brings the logo back.
- **One spinner line, expandable.** While Reconix works, one line shows what it is doing
  now. `Ctrl+O` (any screen) expands it to list the steps it already finished, and
  collapses it again. The choice is kept on the app, so it sticks across screens.
- **The scope reads as plain language, not JSON.** "Reconix will test X as a web
  application.", "What it may do" (✓), "What it will never touch" (✗), "Tools it will
  use". The time limit is not shown (it stays in the manifest, the edit form and
  enforcement). There's no raw JSON view anywhere. The JSON *export format* for reports
  is a machine-readable file and stays.

## Pieces

| Where | What |
|---|---|
| `models/scope.py` | `ScopeSummary` (headline, may_do, never, tools) |
| `store/scope_view.py` | `describe_scope(scope)`: the human wording per template kind and action |
| `store/transcript.py` | `last_exchange()`: the operator's latest line and Reconix's entries after it |
| `widgets/activity.py` | `ActivityStatus`: a `Spinner` whose finished steps show when expanded |
| `widgets/manifest.py` | `ScopeManifestView` draws the `ScopeSummary` (no JSON) |
| `widgets/prompt.py` | `PromptBox.set_locked()`: lock the input without the status overlay |
| `screens/start.py` | `view_state()`: `welcome` / `conversation`; spinner in the transcript |
| `screens/template.py` | busy state uses `ActivityStatus`; the panel reads "draft · needs your approval" |
| `screens/approval.py` | details "Scope limits" use the same plain-language summary |
| `app.py`, `screens/help.py` | `Ctrl+O` binding and help row |

## Tests

- Start: logo shown before input, gone after it; the request is on top; a question's
  answer appears under it; `Ctrl+O` shows the finished steps.
- Scope: the view has no `{`, no `"key":`, and no time limit; an edit shows up in words.
- `describe_scope` for each of the four templates.
