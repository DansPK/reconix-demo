# Windows support and a working fresh clone

The TUI already runs on Windows (Textual), but the web dashboard's **Terminal** page
refuses to: its helper (`reconix/webterm`) runs the TUI on a Unix pseudo-terminal (`pty`,
`fcntl`, `termios`, process groups and signals). This change gives the helper a Windows
backend, fixes the launchers for Windows, and makes the README's steps work on a fresh
clone (they `cd` into the wrong folder today).

## Decisions (agreed with the owner)

- **Run on Windows (OS)**: someone who clones the repo on Windows 10+ can run the TUI, the
  dashboard and its Terminal page.
- **Verified here on Linux** (fresh copy of the tree, README steps, dashboard + Terminal
  page in a browser); **the owner tests on a Windows PC**. Windows code is covered by unit
  tests with a stand-in for the Windows console.

## Terminal helper (`reconix/webterm/`)

- `session.py` keeps what both platforms share (`child_env`, limits) and `spawn()`, which
  picks the backend: `pty_posix.py` (today's `PtySession`, unchanged) or `pty_windows.py`.
- `pty_windows.py` — `ConPtySession` on **ConPTY** through `pywinpty` (`winpty.PtyProcess`,
  the library Jupyter's terminals use). Same interface as `PtySession`: `read()` (a reader
  thread feeds an asyncio queue; b"" at the end, also when the program ended but the
  console stays quiet), `write()` (UTF-8 decoded incrementally, a writer thread, the same
  1 MiB cap), `resize()`, `close()` (terminate, then free the console), `pid`.
  - ConPTY ignores a resize to the same size, and the page's **Clear** relies on one to
    repaint: a same-size resize steps one row down and back.
  - Nothing typed is logged, as on Linux.
  - When the helper stops, it closes every console, and Windows ends the programs attached
    to it. No job object: it would also kill a browser or viewer the TUI opened, which
    keep running on Linux and macOS.
- `server.py` — signal handlers fall back to `signal.signal` where the event loop has
  none (Windows), and the "stop when the launcher dies" watch reads stdin in a thread there.
- `settings.problem()` — on Windows it checks for `pywinpty` instead of `fcntl`/`termios`.
- `requirements.txt` / `pyproject.toml`: `pywinpty; sys_platform == "win32"`.

## Launchers

- `web/scripts/serve.mjs` — without a `.venv`, use `python` on Windows (`python3` is
  usually missing or a Store stub there). On Windows the helper is stopped by closing its
  stdin (it then closes its sessions properly); Node's `kill()` there is a hard kill.
- `reconix/web_server.py` (`/web`) — Windows: start npm in its own process group, stop it
  with `taskkill /T /F` (terminating `npm.cmd` alone leaves Node and the dashboard running).
- PDF export finds Chrome or **Edge** in their Windows install folders (both
  `store/report_pdf.py` and `web/src/lib/report/pdf.ts`), so it works on a stock Windows.

## Fresh clone

- README: clone over HTTPS into `Reconnix_Terminal` and `cd` there; Windows (PowerShell)
  steps next to the Linux/macOS ones (`py -m venv .venv`, `.venv\Scripts\Activate.ps1`,
  `$env:RECONIX_DATA_DIR = "sample-data"`); the Terminal page needs Linux, macOS or
  Windows 10+.
- Check on Linux: copy exactly the files a clone gets (`git ls-files` plus the new ones),
  follow the README, sign in, open every page and the Terminal page (the real TUI), run
  `pytest`, `npm test`, `npm run build`.

## Tests

- `ConPtySession` against a stand-in `winpty` module: output then end, UTF-8 split across
  keystroke frames, the input cap, same-size resize, close returns the exit code, a
  program that can't start is an `OSError` (the page then says so).
- `problem()` on Windows with and without `pywinpty`; `spawn()` picks the backend;
  `/web`'s stop uses `taskkill` on Windows.
- Everything that ran before still passes on Linux.
