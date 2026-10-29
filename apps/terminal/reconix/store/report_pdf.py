"""Render `report.report_data()` as a PDF from the styled HTML report.

Two engines, in order: WeasyPrint when it is installed, otherwise a headless
Chrome/Chromium that prints the HTML report (no system libraries needed — just a browser
already on the machine). PDF export is available when either is present; the result is the
same one-page-first document the HTML report shows.
"""

import importlib.util
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, Optional

from .errors import StoreValidationError
from .report_html import render_html

HAS_WEASYPRINT = importlib.util.find_spec("weasyprint") is not None

_CHROME_NAMES = ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome",
                 "msedge")
_CHROME_PATHS = (
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
)


def _windows_paths() -> list:
    """Where Chrome and Edge (Chromium, on every Windows 10+) install on Windows."""
    bases = (os.environ.get(name) for name in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"))
    return [str(Path(base, *parts)) for base in bases if base
            for parts in (("Google", "Chrome", "Application", "chrome.exe"),
                          ("Microsoft", "Edge", "Application", "msedge.exe"))]


def chrome_binary() -> Optional[str]:
    """A Chrome/Chromium executable to print with, or None. RECONIX_CHROME overrides."""
    override = os.environ.get("RECONIX_CHROME")
    if override:
        return shutil.which(override) or (override if Path(override).exists() else None)
    for name in _CHROME_NAMES:
        found = shutil.which(name)
        if found:
            return found
    return next((path for path in (*_CHROME_PATHS, *_windows_paths()) if Path(path).exists()),
                None)


def pdf_available() -> bool:
    return HAS_WEASYPRINT or chrome_binary() is not None


HAS_PDF = pdf_available()


def _print_with_chrome(chrome: str, html: str, out: Path) -> None:
    with tempfile.TemporaryDirectory(prefix="reconix-pdf-") as tmp:
        source = Path(tmp) / "report.html"
        source.write_text(html, encoding="utf-8")
        cmd = [
            chrome, "--headless=new", "--disable-gpu", "--no-sandbox",
            "--no-pdf-header-footer", f"--print-to-pdf={out}", source.as_uri(),
        ]
        try:
            subprocess.run(cmd, check=True, timeout=90,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except (subprocess.SubprocessError, OSError) as exc:
            raise StoreValidationError("Couldn't render the PDF with the browser.") from exc
    if not out.exists() or out.stat().st_size == 0:
        raise StoreValidationError("The browser did not produce a PDF.")


def write_pdf(data: Dict[str, Any], path) -> None:
    """Write the HTML report rendered to a PDF file at `path`."""
    html = render_html(data)
    if HAS_WEASYPRINT:
        from weasyprint import HTML
        HTML(string=html).write_pdf(str(path))
        return
    chrome = chrome_binary()
    if chrome is None:
        raise StoreValidationError("PDF export needs WeasyPrint or a Chrome/Chromium browser.")
    _print_with_chrome(chrome, html, Path(path).resolve())
