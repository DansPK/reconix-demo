# Review findings and fix them

### Review
- Findings are listed by severity: **critical, high, medium, low**.
- Click a finding to open its file at the exact line. Gutter icons, hover cards, and the
  Findings tree all point at the same place.
- Ask the chat about them, e.g. **"summarize the findings"** or **"explain this one"**.
- Findings judged **likely false positives** are hidden by default
  (`reconix.showLikelyFalsePositives` shows them).

### Fix
Ask the chat to **fix** a finding (or use the finding's **Fix** action). The AI fix agent:

1. edits a copy of the file on the server,
2. streams its progress into the chat, and
3. returns the change as a **diff** — nothing is written to your files yet.

Review the diff and **apply** it if you're happy. Fixes apply to the files in your open
workspace, so open your project as the folder (a scan of a **GitHub repository** can't apply
fixes to your disk).

Some findings can't be auto-fixed (a leaked secret, an outdated dependency); the agent says
why and what to do by hand.
