# Web: a leaner dashboard; terminal: the chat goes on after a run

Status: in progress (2026-10-22). Branch `feature/next`. The AI Assistant's models are the
other half of this round: `WEB_DOCS_AND_MODELS_PLAN.md` §2.

## 1. Dashboard

- **No Scope view.** The sidebar (and the docs' copy of it) loses Scope; the view, its derive
  and its panels go. An old `?view=scope` opens the Overview, as `?view=audit` already does.
  The scope facts stay in the saved files, the reports and the TUI.
- **Findings by Severity** always shows four rows, Critical, High, Medium, Low, in that order,
  even at 0. Info never shows on the card (the Findings view still lists it); the bar, its
  label and the card's total count the four levels.
- **Duration card**: the value, the meter and any badge stay; the line under it goes ("in
  total · longest … of …", "of the … limit", "no time limit").
- **Assessment selector**: just the list. With one run open the panel starts with its name as
  a link to that run's Overview (`/?uid=…`); then the search (more than six runs), "All
  assessments", one row per run and the skipped-files notice (a warning, so a broken file is
  never silently missing). The status, progress, started, duration and operator rows, the
  every-run counts, the folder line and the count line go.

## 2. Terminal

- After a run finishes (completed or stopped), a typed line is a chat turn about **that**
  assessment: the same history and context (findings, decisions) reach the model, or the
  built-in reply says the run is done and what to type. It no longer starts a new assessment;
  `/new`, `/assess <target>` and `/template` do.
- Agent mode already keeps the harness `Agent` and its history after a turn; that stays.
- The Findings, Finding Detail and Report screens get a key to chat (the Start prompt, with a
  draft about the finding where there is one).

## 3. Figma

"Local Web UI (Copy)" follows the code: the sidebar without Scope (and its frames removed),
four severity rows, the Duration card without its line, the selector panel, the top bar without
the operator badge, the docs in the dashboard frame and the assistant's model menu and Add
model form. Built through the Plugin API in the owner's Chrome, after the code is merged.

## 4. Checks

`pytest -q`, ruff, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`,
`npm run e2e`; the dashboard checked live on the sample data.
