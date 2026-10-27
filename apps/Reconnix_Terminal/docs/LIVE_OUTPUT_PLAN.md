# Plan — an easy-to-watch live output, loading without percentages

2026-10-06. Classic UI (`classic-ui`). Display only: the store and the run don't change.

## Decisions (from the user)

- **No percentages while loading.** A real backend can't say how far a scan has got, so
  the Execution screen stops showing "45%" per task and the "overall 61%" bar. A task is
  `queued`, `running…`, `paused` or `done`. One spinner line shows what Reconix is working
  on and for how long ("✶ Validate access controls…   1m 12s · ^C to stop"), the same
  "loading" look as the Start screen. The store keeps `run.progress` internally (it
  decides each task's status and goes into the saved copy); nothing on screen shows it
  as a number.
- **The live output is easy to watch.**
  - One format for every line: time · who · message, in aligned columns. Wrapped text
    stays under its message (hanging indent).
  - Plain names instead of mixed marks: `reconix`, `policy`, `tool`, `you`, `system`
    (no `[POLICY]` / `■` / `◆`). Blocked lines stay red, warnings amber, successes green.
  - It follows the newest line only while you're at the bottom. Scroll up to read and it
    stays put; the border shows "↓ N new · End to follow". `End` (or scrolling back to
    the bottom) follows again.
  - It fills the rest of the screen instead of a fixed 12 lines.

## Pieces

| Where | What |
|---|---|
| `widgets/run_log.py` | `entry_row()` (time/who/message grid); `RunLog` follow mode, unseen count, `set_status()` |
| `screens/execution.py` | task details without %; a `Spinner` replaces the `ProgressBar`; elapsed time; `End` |
| `reconix.tcss` | `#live-log` fills the height; drop the unused `ProgressBar` / `.overall` rules |

## Tests

- No `%` anywhere on the Execution screen, mid-run or at the end.
- The spinner shows while running and hides when the run pauses or ends.
- Log lines read `time  who  message`; scrolling up stops following and counts new lines;
  `End` follows again.
