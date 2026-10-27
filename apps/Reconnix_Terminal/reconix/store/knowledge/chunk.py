"""Split extracted text into overlapping passages on paragraph boundaries.

A passage is at most 1,200 characters and passages overlap by about 150 characters, so a
sentence split across a boundary is still searchable from either side. Paragraphs (runs of
text between blank lines) are the unit; one longer than a passage is windowed on whitespace.
At most 2,000 passages are produced; `split()` also says whether text was left over.
"""

import re
from typing import List, Tuple

MAX_CHARS = 1200
OVERLAP = 150
MAX_PASSAGES = 2000

_PARAGRAPH = re.compile(r"\n\s*\n")
_WS = re.compile(r"\s")


def chunk(text: str) -> List[str]:
    """Return the passages for `text` (at most `MAX_PASSAGES`)."""
    return split(text)[0]


def split(text: str) -> Tuple[List[str], bool]:
    """`(passages, cut)`: the passages for `text` (at most `MAX_PASSAGES`), and True when the
    cap left text out."""
    units = _units(text)
    passages: List[str] = []
    current = ""
    for unit in units:
        candidate = unit if not current else f"{current}\n\n{unit}"
        if len(candidate) <= MAX_CHARS:
            current = candidate
            continue
        if current:
            passages.append(current)
            if len(passages) >= MAX_PASSAGES:
                return passages, True               # `unit` (at least) is left out
            tail = _overlap_tail(current)
            start = f"{tail}\n\n{unit}" if tail else unit
            current = start if len(start) <= MAX_CHARS else unit
        else:
            current = unit
    if current:
        if len(passages) >= MAX_PASSAGES:
            return passages, True
        passages.append(current)
    return passages, False


def _units(text: str) -> List[str]:
    """Paragraphs, each already no longer than `MAX_CHARS` (long ones windowed)."""
    units: List[str] = []
    for block in _PARAGRAPH.split(text or ""):
        para = block.strip()
        if not para:
            continue
        if len(para) <= MAX_CHARS:
            units.append(para)
        else:
            units.extend(_window(para))
    return units


def _window(para: str) -> List[str]:
    """Slice an over-long paragraph into <= MAX_CHARS windows that overlap and prefer spaces."""
    windows: List[str] = []
    start = 0
    step = MAX_CHARS - OVERLAP
    while start < len(para):
        end = min(start + MAX_CHARS, len(para))
        if end < len(para):
            cut = para.rfind(" ", start + step, end)
            if cut != -1:
                end = cut
        windows.append(para[start:end].strip())
        if end >= len(para):
            break
        start = max(end - OVERLAP, start + 1)
    return [w for w in windows if w]


def _overlap_tail(passage: str) -> str:
    """About `OVERLAP` characters from the end of `passage`, starting at a word boundary."""
    tail = passage[-OVERLAP:]
    match = _WS.search(tail)
    if match and match.end() < len(tail):
        tail = tail[match.end():]
    return tail.strip()
