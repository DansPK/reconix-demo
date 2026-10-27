# Web redesign v2 plan: cinematic transition, ChatGPT-style assistant, clearer dashboard

2026-10-20. Status: **built** (the owner said START, 2026-10-20); see "Results" at the end.
The owner's brief covers 11 points (slower animation, a faint globe behind the assistant, an
assistant like ChatGPT/Claude, clear colours and labels, three main analytics panels, removing
two cards and the Audit Log page, fixing scrolling, breathing effects, worktrees and
subagents, and checks).

## 1. Current state and the problems found

Each item below was checked in Chromium on the owner's 27 saved runs, or read in the code.

| # | Problem | Evidence / cause |
|---|---------|------------------|
| 1 | **The mouse wheel can't scroll the dashboard.** | Lenis smooth scrolling is mounted for the whole site in `app/layout.tsx` and takes over every wheel event to scroll the *window*. On desktop sizes (≥1280×760) the frame has a fixed height and the scrolling box is `.dash-content`, so the wheel moves nothing. Measured: the Findings view had 2,950 px to scroll and the wheel moved 0 px at 1366×768 and at 1920×1080. At 1280×720 the window scrolls instead, so it works there. |
| 2 | Overview cut off at 1366×768 | 42 px of the Overview can't be reached (the bottom stat cards, as in the owner's screenshot), and cause #1 blocks scrolling to them. |
| 3 | Severity colours differ from the TUI | The TUI (`theme.SEVERITY`) uses CRITICAL `#F2495C`, HIGH orange `#F97316`, MEDIUM amber `#FBBF24`, LOW sky blue `#38BDF8`, INFO slate `#94A3B8`. The web shows HIGH in the same red as CRITICAL, and LOW in green. |
| 4 | One colour has several meanings | Amber means MEDIUM, "blocked by policy" and "waiting on you". Green means LOW and also "success". |
| 5 | Charts are hard to read | The Activity Timeline is a 270 px glass card with two unlabelled strips. Execution Timeline lanes are named only in tooltips. With all runs shown, 27 dots overlap and grey dots have no legend. |
| 6 | The same numbers appear twice | Progress appears in the gauge, the Status chip and the switcher. Tool Activity's "6,936 requests sent" isn't explained. |
| 7 | The assistant is too quick and too plain | The transition is about 0.8 s. A CSS orb stands in for the globe. Code blocks have no copy button and tables aren't handled. There is no scroll-to-bottom button and only one conversation. The mic only shows a note, because no voice feature exists. Auto-resizing the composer uses `field-sizing`, which only Chrome supports. |
| 8 | A CSS trap | `.dash-chip` sets `display`, which beats Tailwind's `hidden` (one case already fixed). The new code needs a rule against it. |
| 9 | Not a bug in our code | The red "1 Issue" badge in dev mode comes from a browser extension adding `bis_skin_checked` to the page. |

Limits to design around (from the code and the project rules):
- The web dashboard is **read-only**. It reads saved snapshots, and its only other action is
  the Terminal page.
- The assistant is a real model (your local Ollama) with **no tools**. It cannot run scans or
  approve actions. Approvals stay in the TUI, with its double check, single-use token and
  command hash.
- Execution steps in the saved data are `pending`, `active` or `done` (plan phases). Run
  statuses are New, Running, Awaiting input, Completed, Stopped and Interrupted. **The data
  has no "failed" state**, so the UI won't invent one.
- There is no microphone feature to keep.

## 2. UI/UX changes in brief

- **Dashboard**
  - A strip of four summary cards along the top: Findings, Assessment progress, Tool
    execution, Duration.
  - The globe hero with the Ask bar.
  - Three main panels: Findings by Severity, Activity Timeline and Execution Timeline, each
    with a legend, labels and tooltips.
- **Colours and labels:** one set of semantic colours with the TUI's severity scale. Every
  status is shown as a badge with an icon, a label and a tooltip, never colour alone.
- **AI Assistant**
  - Built like ChatGPT or Claude: a slim header, one centred conversation column, Markdown
    with copyable code and scrollable tables, a rounded composer that grows as you type, and
    a scroll-to-bottom control.
  - Cards built from real data (findings, progress, approvals, policy blocks, tools, report
    downloads).
  - The real globe stays behind the welcome screen at about 18% opacity and fades away once
    the conversation starts.
- **Transition:** slower and cinematic (about 1.6 s), with the globe itself moving from the
  hero into the assistant's background.
- **Removed:** the Policy checks and Blocked by policy cards, and the Audit Log view. The audit
  data and every security control stay.

## 3. Animation sequence and timing

All values live in `components/assistant/motion.ts` (`MOTION`), so they can be tuned after a
visual check. Easing: `power2.inOut` for the parts leaving, `expo.inOut` for the expansion and
`power2.out` for the parts arriving. There is no bounce.

**Open** (desktop frame ≥1280×760; elsewhere a 300 ms crossfade):

| Time (ms) | Element | Motion |
|----------:|---------|--------|
| 0–350 | Sidebar AI item | The active bar grows in and the glow rises |
| 0–300 | Hero title, Ask bar text | Fade out |
| 0–850 | Top bar | Up by its full height, fading |
| 60–910 | Summary strip (top) | Up 48 px, fading |
| 120–970 | Findings by Severity (right) | Right 140 px, fading |
| 180–1030 | Activity and Execution Timeline (bottom) | Down 140 px, fading |
| 150–1450 | Chat surface | From the hero's box to the whole area beside the sidebar; corners 16 → 0; background 0 → 0.9 |
| 150–1450 | Globe | From the hero to centred behind the welcome; opacity 1 → 0.18; it keeps rotating |
| 1050–1600 | Header, welcome, composer | Fade in and rise 12 px, 70 ms apart |
| ~1600 | Breathing | Starts |

**Close:** the same in reverse, about 1.4 s. It is measured again when it starts, so a resized
window still lands right. A click during a transition reverses from wherever things are.

**Globe states:**
- On the dashboard: 1.0.
- On the assistant's welcome screen: 0.18 (adjustable from 0.10 to 0.30) with a teal glow.
- After the first message: fades to 0 over 600 ms, then stops drawing.
- "New chat": fades back to 0.18.

The globe stays one WebGL instance. It never mounts a second time, and it pauses whenever it
can't be seen.

**Breathing** (one 6 s cycle shared by all three, phase-aligned, started only after the open
has settled):
- Sidebar icon: scale 1 → 1.10 with a halo.
- Globe or orb: scale 0.98 → 1.02 with the glow.
- The whole chat panel, contents included: scale 1.000 → 1.003, with the glow from 0.35 to
  0.6.

The transition and the breathing run on separate layers, so they never fight.

**Reduced motion:** no movement and no scaling. A 200 ms fade, a still halo, and the globe
stays still.

## 4. Dashboard layout

```
┌──┬ top bar ──────────────────────────────────────────────────────────┐
│  │ [Findings 30 · 14 high] [Progress 44% · 2/5 steps · Interrupted]   │  summary strip
│ s│ [Tool execution 3 tools · 5 steps]  [Duration 14m of 30m]          │
│ i├──────────────────────────────────────────┬─────────────────────────┤
│ d│ hero: globe · title · Ask bar             │ Findings by Severity    │
│ e│                                           │  stacked bar + legend   │
│ b├────────────────────┬─────────────────────┤  rows: label·count·%    │
│ a│ Activity Timeline  │ Execution Timeline  │  top findings + CVSS    │
│ r│ lanes by kind,     │ rows per plan phase │                         │
│  │ legend, time axis  │ (or per run), badges│                         │
└──┴────────────────────┴─────────────────────┴─────────────────────────┘
```

- **Summary strip**, which replaces Policy checks and Blocked by policy, and folds in the
  Progress gauge and Tool Activity cards so nothing shows twice:
  - Findings: the total and its worst severity, each with a label.
  - Assessment progress: percent, steps done out of total, and the state as a badge. With all
    runs shown: runs completed out of all runs.
  - Tool execution: tools used and tool steps, with "running" while a run is going. No
    "failed", because the data doesn't record it.
  - Duration: time elapsed, against the time limit.
- **Findings by Severity:**
  - A stacked bar plus one row per severity: badge, count and share.
  - The top 3 findings with CVSS and their run.
  - TUI colours throughout.
- **Activity Timeline**, now a full panel instead of a narrow card:
  - Labelled lanes for Scope, Policy, Tool, Finding, Approval gate and Operator, on a time
    axis with ticks.
  - A legend, and a tooltip with the time and the line.
  - With all runs shown: runs per day, with an axis.
- **Execution Timeline:**
  - One labelled row per plan phase, with Planned / Running / Done badges and tool segments
    inside.
  - With all runs shown: the latest 8 runs as rows with status badges, instead of 27
    overlapping dots.
- **Breakpoints:**
  - ≥1280: the grid above.
  - 768–1279: one column.
  - Phones: everything stacked.

  The panels have minimum heights, and the page scrolls instead of clipping (see §6).

**Audit Log removal**, in the UI only:
- Removed: the sidebar item, the `audit` view, `audit-view.tsx`, its filters, and its e2e
  tests. Old `?view=audit` links open the Overview.
- Kept: the saved timelines, the TUI's audit dialog and trail, the timeline in report exports,
  and every policy, approval and secret control. Nothing on the Python side changes.

## 5. AI Assistant screen

```
┌ header: ◉ Reconix AI Assistant │ All assessments · 27 runs [badge] │ llama3.2 · local │ History ▾ │ ＋ New chat │ ⤡ ┐
│                                                                                                    │
│                 (globe at 0.18 behind)   How can I help with your assessments?                     │
│                 Answers come from your saved assessment data. Decisions stay in the TUI.           │
│        ┌ Analyze current findings ┐ ┌ Review assessment progress ┐ ┌ What waits on my approval? ┐     │
│        ┌ Explain F-001 (HIGH)     ┐ ┌ Generate a report          ┐ ┌ Plan a security assessment ┐     │
│                                                                                                    │
│                ╭──────────────────────────────────────────────────────────╮                        │
│                │ Ask about your assessments…                     (stop/send) │                     │
│                ╰──────────────────────────────────────────────────────────╯                        │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Conversation:**
  - A centred column 768 px wide.
  - Your messages: right-aligned bubbles.
  - Assistant replies: full width beside the orb avatar, in Markdown (headings, lists,
    scrollable tables, code blocks with language and Copy).
  - Copy and Retry (after an error) on each reply, Stop while it streams, and a "↓ New
    messages" button when you have scrolled up.
- **Cards from real data** (always shown the same way):
  - The server picks them from what was asked and builds them from the saved files, then
    streams them with the text.
  - The stream changes from plain text to one JSON line per piece (`{"t":"card"|"text"|"error",…}`).
  - The model only writes the explanation around them.

| Response type | What it shows | Real source |
|---------------|------|-------------|
| Normal conversation | Text | Model |
| Findings analysis | Finding cards: severity badge, CVSS, target, run, "Open in Findings" | Saved findings |
| Assessment planning | A progress card for the run's plan phases. For "Plan a new assessment": guidance only, plus **Open Terminal** (planning happens in the TUI) | Saved plan / Terminal |
| Tool execution | Tools used: steps and times (from the log; nothing runs) | Saved timeline |
| Approval requests | Pending and decided approvals, with "Decide in the TUI" and **Open Terminal** (operators). **Nothing can be approved from the chat.** | Saved approvals |
| Report generation | Download links: PDF, JSON, DOCX (2026-10-21; it was PDF, HTML, JSON, CSV, SARIF) (with all runs shown, it asks for a run first) | Existing export route |
| Errors / restrictions | An error card with the reason and what to do (model not set up, viewer role, too many questions, can't act) | Route |

- **Composer:**
  - Rounded and grows with JS up to 8 lines.
  - Enter sends, Shift+Enter adds a line, Esc stops.
  - A counter near the length limit.
  - When disabled, it says why.
  - The non-working mic is removed (question 2).
- **Conversations:** New chat, plus a History menu of earlier conversations in this tab
  (question 3).

## 6. Scrolling and responsive fixes

1. **Lenis only where it belongs:** move `SmoothScroll` from the root layout into the docs
   layout. The dashboard uses native scrolling, which fixes cause #1 for the wheel, trackpad
   and keyboard.
2. **Frame layout:**
   - Rows and panels get `min-height: 0` and real minimum heights.
   - `.dash-content` is the one vertical scroller (`overscroll-behavior: contain`).
   - Nothing is clipped by `overflow: clip` on a card that holds content.
   - No `overflow: hidden` on the page.
3. **Assistant:**
   - The conversation is its own scroller (`flex: 1; min-height: 0`), with the composer
     outside it so it is always visible.
   - It follows new text only while you are near the bottom; otherwise it shows "↓ New
     messages".
   - Wide code blocks and tables scroll sideways inside the message.
4. **Test sizes:** 1920×1080, 1440×900, 1366×768, 1280×720, 1024×768 and 390×844, with the
   wheel, keyboard (PgDn/Space) and touch emulation; and no sideways scroll on the page.
5. **Accessibility:**
   - An axe check on the Overview, Findings and the assistant.
   - Focus order when the assistant opens and closes.
   - Contrast of every badge colour against its background.

## 7. Files

**Shared contracts, written by the main agent first (phase 0):**

| File | Change |
|------|--------|
| `reconix/theme.py` → `web/src/styles/tokens.css` | Add `info` and `sev-critical`, `sev-high`, `sev-medium`, `sev-low`, `sev-info` from `theme.SEVERITY` (one source) |
| `web/src/lib/status.ts` + `components/ui/status-badge.tsx` (new) | One list of meanings: each status, phase, approval, policy decision and severity, with its label, colour, icon and tooltip |
| `web/src/app/globals.css` → `styles/{frame,dashboard,assistant,motion}.css` (split) | One owner per file during the parallel phase |
| `components/dashboard/derive.ts` (types only) | `OverviewCards` v2: summary strip, `timelines`, `severity`, legends |
| `lib/assistant/protocol.ts` (new) | Stream pieces and card types, shared by the route and the page |
| `data-motion="top\|right\|bottom\|hero"` attributes | How the transition finds dashboard parts (not by class names) |
| Audit Log removal | `viewer.tsx`, `sidebar.tsx`, `view-url.ts`, `page.tsx`, `filters.ts`, `audit-view.tsx` (deleted) |
| `playwright.config.ts` | Ports can be set from the environment, so parallel worktrees don't collide |

| Area | Modified | Replaced / removed | New |
|------|----------|--------------------|-----|
| Motion | `assistant-stage.tsx`, `motion.ts`, `breath.ts`, `globe.tsx`, `lib/globe.ts` (opacity, pause, follow a box), `sidebar.tsx` (AI item) | The CSS orb as the background (kept as the small avatar) | `use-globe.ts` (the globe's controls) |
| Assistant | `assistant-view.tsx`, `composer.tsx`, `message-text.tsx`, `assistant-provider.tsx` (stream pieces, conversations), `api/assistant/route.ts` (stream pieces) | — | `welcome.tsx`, `prompt-cards.tsx`, `message.tsx`, `code-block.tsx`, `cards/{findings,progress,approvals,policy,tools,report,error}.tsx`, `conversation-menu.tsx`, `lib/assistant/cards.ts` |
| Dashboard | `overview-view.tsx`, `derive.ts`, `derive-overall.ts`, `findings-card.tsx`, `activity-timeline.tsx`, `execution-timeline.tsx`, `top-bar.tsx`, `assessment-switcher.tsx`, `run-chips.tsx`, `overall-chips.tsx` | `stat-cards.tsx` → `summary-strip.tsx`; `progress-gauge.tsx` and `tool-activity.tsx` removed (folded in) | `legend.tsx`, `chart-tooltip.tsx` |
| Scrolling | `app/layout.tsx`, `app/docs/layout.tsx` (Lenis), `styles/frame.css` | — | `use-stick-to-bottom.ts`, `scroll-to-bottom.tsx`, `e2e/scroll.spec.ts`, `e2e/a11y.spec.ts` |

Untouched: the Python store, the gates, the approval rules, `snapshot.py` / `redact.py`, the
Terminal page and its helper, the auth/proxy rules (except removing `audit` from the views),
and the export routes.

## 8. Worktrees and subagents

**Before anything else:** a worktree is created from a commit, and today ~166 changes are
still uncommitted (the whole globe dashboard and the assistant). A worktree made now would not
contain them. With the owner's OK, phase 0 commits the current state on `New_redesignV1` and
creates the integration branch `redesign/v2` from it.

| Phase | Who | Branch / worktree | Owns (only they edit) |
|------:|-----|-------------------|------------------------|
| 0 | Main agent | `redesign/v2` (the repo itself) | All shared contracts in §7, the Audit Log removal, the CSS split, configurable ports |
| 1 | A: animation and navigation | `redesign/v2-motion` in `../reconix-wt/motion` | `components/assistant/{assistant-stage,motion,breath}`, `globe.tsx`, `lib/globe.ts`, `use-globe.ts`, `sidebar.tsx`, `styles/motion.css` |
| 1 | B: assistant UI and UX | `redesign/v2-assistant` in `../reconix-wt/assistant` | `components/assistant/*` (except A's files), `lib/assistant/*`, `api/assistant/route.ts`, `styles/assistant.css`, assistant tests |
| 1 | C: dashboard | `redesign/v2-dashboard` in `../reconix-wt/dashboard` | `components/dashboard/*` (except the sidebar), `derive*.ts`, `styles/dashboard.css`, `tests/dashboard.test.ts`, `e2e/pages.spec.ts` |
| 1 | D: scrolling, responsive layout, accessibility | `redesign/v2-scroll` in `../reconix-wt/scroll` | `app/layout.tsx`, `app/docs/layout.tsx`, `styles/frame.css`, `use-stick-to-bottom.ts`, `scroll-to-bottom.tsx`, `e2e/{scroll,a11y}.spec.ts` |
| 2 | Main agent + `code-reviewer` + `security-reviewer` | `redesign/v2` | Review, merge, integrate, run every check |

Where the agents meet, phase 0 fixes the interface first:
- B uses D's `useStickToBottom` hook (a stub is written in phase 0).
- A finds the dashboard parts by C's `data-motion` attributes.
- A places the globe through a slot that B leaves in the welcome screen.

Each worktree:
- Runs `npm ci`: about 780 MB and 1–2 minutes each.
- Uses its own ports: A 3210, B 3220, C 3230, D 3240.
- Asks only the stand-in model. `web/.env.local` isn't copied; it holds no secret anyway.

## 9. Merging, review and tests

- **Each agent, in its worktree, before reporting done:**
  - `tsc`, `lint`, `vitest`, a build, and its e2e tests, all passing.
  - Focused commits on its own branch.
  - No edits outside the files it owns (checked with `git diff --name-only`).
- **The main agent, for each branch:**
  - Reads the diff and runs `code-reviewer` (and `security-reviewer` for B, whose route and
    protocol change).
  - Merges with `git merge --no-ff` in the order D → C → B → A. Motion goes last because it
    depends on the final page structure.
  - Resolves any conflict by hand, never by throwing a side away.
  - Runs the full suite after each merge.
- **Final checks:**
  - Web: `tsc`, `lint`, `vitest`, a build and every e2e test. TUI: `pytest -q`.
  - A browser pass at the six sizes in §6, frame by frame for the transition, with the
    owner's real data and the local model.
  - The §10 checklist from the brief, ticked off with evidence.
- **Never** a push, a force operation or a branch deletion. Worktrees are removed only after
  merging, and only when the owner agrees.

## 10. Risks and dependencies

- **Committing the current state is required** for worktrees (see §8).
- 1.6 s every time may feel long once it is familiar. It is one constant to change.
- Keeping the globe drawn at low opacity costs GPU while the welcome screen is open. It stops
  drawing once the chat starts, when the tab is hidden, and on low-power devices.
- The stream format changes from text to JSON lines, so the e2e stand-in model and the tests
  change with it.
- A small local model (llama3.2, 3B) writes weak plans and explanations. The cards keep the
  facts right whatever it writes.
- Removing the Audit Log view leaves no full per-run log in the web UI (the TUI and the
  exports still have it).
- The new layout changes the selectors the e2e tests use, so C rewrites those tests.

## Questions for the owner (the recommended default applies unless answered)

1. Commit the current work on `New_redesignV1`, then branch `redesign/v2`? *(Required for worktrees.)*
2. Microphone: **remove it** (no voice feature exists), or keep it with "not available"?
3. History: **in this tab only** (cleared when the tab closes; assessment data is sensitive), or kept across browser restarts?
4. Cards: **chosen by the server from the question** (reliable with small models), or let the model ask for data through read-only tools?
5. Activity Timeline tooltips show each log line's text. Is that fine once the Audit Log view is gone? **(Default: yes.)**

## Owner's decisions (2026-10-20)

1. **Commit and worktrees: yes.** Commit the checked changes on `New_redesignV1`, create
   `redesign/v2` from that commit, and give each subagent its own worktree. No push, no force,
   no branch deletion.
   *Pre-commit check done:*
   - No secrets, keys, personal paths or real hosts in the 167 changes. The only key-shaped
     text is the fake redaction test cases.
   - No temporary files.
   - `.env.local`, `.next/`, `test-results/`, `node_modules/` and `tsconfig.tsbuildinfo` are
     git-ignored.
   - `web/public/globe/land.bin` (148 KB, the globe's land data) is committed as a runtime
     asset.
2. **Microphone: removed** everywhere (no controls that don't work).
3. **Conversation history: persistent**, kept on this machine by the dashboard's server, not
   in browser storage. The design below was approved; it supersedes §5's "History in this tab".
4. **Cards: chosen by the server.** The model only explains; findings, severities, tool states,
   execution results and statistics come only from the saved data. Still read-only for
   assessments: nothing is scanned or approved.
5. **Activity Timeline details: yes.**
   - Tooltips, plus entries that expand.
   - Readable timestamps, tool and event labels, and status badges.
   - Text masked with `redact.ts` (on top of the redaction the snapshot already applied).
   - No overlapping marks.

   The audit data stays in the saved files and in the TUI.

Additional notes:
- **A:** keep the 1.6 s open. It should feel smooth because the motion is continuous: one
  surface, and the globe carried from the hero into the background. It should not get longer
  by waiting longer.
- **B:** a minimal, professional assistant. *(The rest of this part of the owner's message was
  cut off. It will be added when the owner sends it again.)*

## Conversation storage (approved by the owner, built)

The smallest solution that fits: **plain files written by the dashboard's own server, with no
database or new service.**

| | |
|-|-|
| **Where** | `~/.reconix/assistant/`, next to `~/.reconix/assessments` (`RECONIX_ASSISTANT_DIR` changes it for tests). The folder is `0700`; there is one `<random id>.json` per conversation, `0600`. |
| **Writing** | Atomic: a temporary file, then a rename. It never follows a symlink. Reading uses the same safe reader as the saved assessments (regular files only, 1 MB cap, zod-checked). |
| **Contents** | Id, title, the run in scope (its uid or "all", and its label), created/updated times, and the messages: masked question, reply, and the cards as they were shown. |
| **Who writes** | Only the server. `POST /api/assistant` takes the conversation id (none starts a new one) and the new question only, so the browser never sends history again. The server saves the masked question, then the reply and cards when the stream ends. The title is the first question, cut to 60 characters (no extra model call). |
| **Routes** | `GET /api/assistant/conversations` (the list), `GET`/`PATCH` (rename)/`DELETE …/conversations/[id]`, and `DELETE /api/assistant/conversations` (all). Operators only (the proxy prefix rule and the handler); anything that changes needs the page's origin; ids are checked. |
| **Retention** | Deleted after 30 days without use (`RECONIX_ASSISTANT_RETENTION_DAYS`; 0 keeps them). At most 100 conversations (the oldest go first) and 200 messages each. Pruned on every list and write. The History menu has Delete and "Delete all". |
| **Privacy** | Questions are masked before saving. The files have the same protection as the saved assessments: owner-only, in the owner's home folder. There is no extra encryption at rest, because its key would have to sit in the same folder. |
| **Browser** | Keeps only which conversation is open and the unsent draft (masked, this tab only). The current conversation copy in `sessionStorage` is removed. |
| **Rule change** | The dashboard stops being strictly read-only: it writes its own conversation files and nothing else. It never writes assessments or anything the TUI reads. README and CLAUDE.md are updated. |
| **Considered and not chosen** | SQLite: a native module and a database to look after, for one local operator. |
| **Tests** | Store: permissions, atomic write, refusing symlinks and large files, retention, limits, masking. Routes: viewer 403, other origin 403, bad id 400. e2e: a conversation survives closing the browser; delete works. Then the security reviewer. |

Owner: subagent B (the assistant), with the `security-reviewer` before the merge.

## Phase 0 contracts (done by the main agent on `redesign/v2`)

What phase 0 did:
- Committed the base (`bdb41d9` on `New_redesignV1`).
- Split `globals.css` into one file per area.
- Added the meaning and severity tokens, `lib/status.ts` and `StatusBadge` / `SeverityBadge`.
- Removed the Audit Log view and the microphone.
- Made the test ports configurable.
- Added the shared scrolling hook.

The agents rely on the following and must not change it:

1. **File ownership.**
   - `src/styles/frame.css` belongs to D, `dashboard.css` to C, `motion.css` to A and
     `assistant.css` to B.
   - `globals.css`, `tokens.css`, `terminal.css` and `site.css` belong to nobody: no edits.
   - `src/lib/status.ts`, `components/ui/status-badge.tsx` and `components/dashboard/view-url.ts`
     are frozen. A meaning that's missing is defined locally and reported.
2. **How the transition finds the dashboard.** C puts `data-motion` on the Overview's groups:
   - `top`: the summary strip.
   - `right`: the Findings by Severity column.
   - `bottom`: the timelines row.
   - `hero`: the globe plus Ask bar box that the chat grows from.
   - `fade`: hero text that only fades (the title and the Ask bar contents).
   - optional `left`.

   A uses only these attributes, never class names. `<Globe />` (A's) stays inside the hero.
3. **Assistant view and motion.**
   - B keeps `data-assistant-piece` on the header, the conversation and the composer.
   - In the welcome state, B renders one `<div data-globe-slot />`: the box the globe sits
     behind. It is gone once the conversation has messages.
   - `useAssistant()` keeps `messages` (the open conversation); A uses `messages.length === 0`
     for the welcome state.
   - `AssistantView` stays `forwardRef<HTMLTextAreaElement, { onMinimize }>`, and A's stage
     renders it.
4. **Scrolling.**
   - `useStickToBottom()` returns `{ ref, atBottom, scrollToBottom }`.
   - `<ScrollToBottom show onClick className />`.
   - D owns both and may improve the inside, but not the shape. B uses them.
5. **Shared entry points.** A owns `viewer.tsx`; B owns `app/page.tsx` (`AssistantInfo`). C
   doesn't edit `page.tsx`: the dashboard data reaches it through `OverviewCards`, and anything
   more goes in C's report.
6. **Test ports.**
   - Each worktree sets `E2E_PORT`: A 3210, B 3220, C 3230, D 3240. The suite also uses
     `E2E_PORT − 1` and `E2E_PORT − 4`.
   - Servers started by hand use `E2E_PORT + 5`.
   - The terminal helper runs with `RECONIX_PYTHON=<repo>/.venv/bin/python`.
7. **Docs.** README, CLAUDE.md and the in-app docs are the main agent's, at integration. Each
   agent lists its doc changes in its report.

## Results (2026-10-20)

Built by four subagents in their own worktrees (A motion, B assistant, C dashboard, D scrolling),
each reviewed by `code-reviewer` (and B twice by `security-reviewer`), fixed, and merged into
`redesign/v2` in the order D → C → B → A, with the full suite after each merge.

- **Checks on the integrated branch:**
  - tsc and lint clean; 371 unit tests; the build.
  - **90 e2e**: access 11, pages 16, assistant 10, scroll 26, a11y 15, motion 12.
  - TUI `pytest -q` 706.
- **Browser pass, owner's 27 real runs and the local `llama3.2`:**
  - The Audit Log is gone; the summary strip shows its 4 cards.
  - Welcome: one WebGL globe at 0.18, drawing.
  - A suggested question was answered in 17 s with a findings card from the server; the globe
    then went to 0 and paused.
  - Closing returns to `/` with the globe back at full quality.
  - After reopening the browser, History lists the conversation and reopens both messages.
  - At 1366×768 the wheel scrolls the Overview (78/78 px) and Findings.
  - The phone welcome starts at its heading, with no sideways scroll; no console errors.
- **Final motion values** (`MOTION`, seconds from the click):
  - Open:
    - top bar 0–0.85, summary strip 0.06–0.91, right 0.12–0.97, bottom 0.18–1.03 (power2.inOut);
    - surface 0.15–1.45 (power4.inOut, not expo: expo packed the growth into about 0.3 s);
    - globe 0.30–1.45 to 0.18;
    - pieces 1.05–1.60, 70 ms apart.
  - Close: 1.40 s.
  - Crossfade: 0.3 s; reduced motion 0.22 s.
  - Breathing: a 6 s cycle (icon 1→1.10, globe 0.98→1.02, panel 1→1.003 with glow 0.35→0.75).
  - No `left` part, because the layout has no left group.
- **Found and fixed during integration:**
  - The Authorization and Cookie masking gap (Python and TypeScript, with shared vectors).
  - A glide in flight overrode the reader's scroll-up.
  - The phone welcome opened at its end.
  - In the motion branch: the globe stayed frozen after a round trip to the docs, kept drawing
    invisibly, drew over the phone's top bar, and was blurred by scaling.
- §4 note: tool segments sit on one shared track under the step rows. The saved data doesn't
  say which step a tool line belongs to.
