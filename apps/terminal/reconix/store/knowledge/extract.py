"""Read a supported file and return its text, with every refusal spelled out.

Supported: `.txt .md` (UTF-8), `.json` (pretty-printed), `.yaml`/`.yml` (`yaml_safe.load`: no
anchors, aliases, merge keys or deep nesting, then text), `.docx` (python-docx paragraphs and
tables) and `.pdf` (pypdf page text). The file is only read, never run.

The file is opened without following a link and without blocking (a FIFO swapped in can't
hang the reader) and checked through that handle: a regular file of at most 10 MB. A `.docx`
must also unzip to at most 50 MB in at most 2,000 parts before python-docx sees it. A PDF is
read page by page, at most 2,000 pages, and stops once the text cap is reached. The extracted
text is capped at 2 MB so a huge document can't blow up the chunker or the index; `Extracted.cut`
says when a cap cut the text short.

Every refusal is a `StoreValidationError` with a message fit for the operator: a symlink, a
non-regular file, an unknown extension, a file over a cap, an encrypted or unreadable document,
and a parser failure (`RecursionError`, `MemoryError`, `OSError`, `ValueError`), so a crafted
file never surfaces as a crash. The display name is cleaned, redacted, put on one line and
capped at 120 characters at ingest, like the passages.
"""

import io
import json
import os
import stat
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, Tuple

from .. import yaml_safe
from ..errors import StoreValidationError
from ..redact import redact

MAX_FILE_BYTES = 10 * 1024 * 1024       # 10 MB on disk
MAX_TEXT_CHARS = 2 * 1024 * 1024        # 2 MB of extracted text
MAX_NAME = 120
MAX_PDF_PAGES = 2000
MAX_DOCX_UNZIPPED = 50 * 1024 * 1024    # every part of a .docx, uncompressed
MAX_DOCX_PARTS = 2000

CUT_TEXT = "cut to the first 2 MB of text"
CUT_PAGES = f"cut to the first {MAX_PDF_PAGES:,} pages"

_EXT_KIND = {
    ".txt": "txt", ".md": "md", ".json": "json",
    ".yaml": "yaml", ".yml": "yaml", ".docx": "docx", ".pdf": "pdf",
}
SUPPORTED = ".txt .md .json .yaml .yml .docx .pdf"
_LABEL = {"txt": "text", "md": "Markdown", "json": "JSON", "yaml": "YAML",
          "docx": "Word", "pdf": "PDF"}


@dataclass(frozen=True)
class Extracted:
    """The outcome of reading one file: its display name, kind, byte size and text.

    `cut` is "" when the whole text was kept, else how a cap cut it short (`CUT_TEXT`,
    `CUT_PAGES`), for the operator's notice.
    """
    name: str
    kind: str
    bytes: int
    text: str
    cut: str = ""
    data: bytes = field(default=b"", repr=False, compare=False)   # the file as read


DOC_REFUSAL = "Save it as .docx first (old .doc files aren't supported)."


def base_name(name: str) -> str:
    """The last component of `name` (either separator): a display name never holds a path."""
    return (name or "").replace("\\", "/").rsplit("/", 1)[-1]


def extract(path_text: str, name: str = "") -> Extracted:
    """Read the file at `path_text` and return its `Extracted` text, or raise.

    `name` (optional) is the display name, whose extension picks the kind: the web saves an
    upload to a temp file and passes the upload's own base name.
    """
    text = (path_text or "").strip()
    if not text:
        raise StoreValidationError("Enter the path to a file to add.")
    if "\x00" in text:
        raise StoreValidationError("That isn't a valid path.")
    try:
        path = Path(text).expanduser()
    except RuntimeError:                      # "~someone" with no such home directory
        raise StoreValidationError("No file at that path.") from None

    try:
        info = os.lstat(path)
    except (OSError, ValueError):
        raise StoreValidationError("No file at that path.") from None
    if stat.S_ISLNK(info.st_mode):
        raise StoreValidationError("That path is a symlink; add the real file instead.")
    if not stat.S_ISREG(info.st_mode):
        raise StoreValidationError("That isn't a regular file.")
    shown = base_name(name) if (name or "").strip() else path.name
    suffix = Path(shown).suffix.lower()
    if suffix == ".doc":
        raise StoreValidationError(DOC_REFUSAL)
    kind = _EXT_KIND.get(suffix)
    if kind is None:
        raise StoreValidationError(f"Unsupported file type. Use one of: {SUPPORTED}.")
    if info.st_size > MAX_FILE_BYTES:
        raise StoreValidationError("That file is too large (over 10 MB).")

    data = _read_regular(path)
    raw, cut = _run_extractor(kind, data)
    if len(raw) > MAX_TEXT_CHARS:
        raw, cut = raw[:MAX_TEXT_CHARS], CUT_TEXT
    return Extracted(name=display_name(shown), kind=kind, bytes=len(data), text=raw,
                     cut=cut, data=data)


def display_name(name: str) -> str:
    """A file name as it may be saved and shown: cleaned and redacted (`redact` cleans first),
    on one line, at most 120 characters. A name is text from the operator's disk: it reaches
    the index, the web, the chat's `Knowledge:` line and the model's prompt."""
    flat = " ".join(redact(name or "").split())
    return flat[:MAX_NAME].rstrip() or "untitled"


def _read_regular(path: Path) -> bytes:
    """The file's bytes, opened without following a link or blocking, checked through the
    handle (a regular file) and refused over the size cap."""
    flags = (os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
             | getattr(os, "O_BINARY", 0))
    try:
        fd = os.open(path, flags)
    except OSError:
        # ELOOP (a symlink slipped in) or a permission problem: both are "couldn't read".
        raise StoreValidationError("Couldn't read that file.") from None
    try:
        with os.fdopen(fd, "rb") as handle:
            info = os.fstat(handle.fileno())
            if not stat.S_ISREG(info.st_mode):
                raise StoreValidationError("That isn't a regular file.")
            if info.st_size > MAX_FILE_BYTES:
                raise StoreValidationError("That file is too large (over 10 MB).")
            data = handle.read(MAX_FILE_BYTES + 1)
    except OSError:
        raise StoreValidationError("Couldn't read that file.") from None
    if len(data) > MAX_FILE_BYTES:
        raise StoreValidationError("That file is too large (over 10 MB).")
    return data


def _run_extractor(kind: str, data: bytes) -> Tuple[str, str]:
    """`(text, cut)` from the kind's extractor, any parser failure turned into a refusal."""
    label = _LABEL[kind]
    try:
        return _EXTRACTORS[kind](data)
    except StoreValidationError:
        raise
    except RecursionError:
        raise StoreValidationError(f"That {label} file is nested too deeply to read.") from None
    except MemoryError:
        raise StoreValidationError(f"That {label} file is too large to read.") from None
    except (OSError, ValueError):
        raise StoreValidationError(f"Couldn't read that {label} file.") from None


# --- per-kind extractors: (text, cut) ------------------------------------------------------

def _from_text(data: bytes) -> Tuple[str, str]:
    return data.decode("utf-8", errors="replace"), ""


def _from_json(data: bytes) -> Tuple[str, str]:
    try:
        obj = json.loads(data.decode("utf-8", errors="replace"))
    except (ValueError, UnicodeError):
        raise StoreValidationError("That file isn't valid JSON.") from None
    return json.dumps(obj, indent=2, ensure_ascii=False, sort_keys=False), ""


def _from_yaml(data: bytes) -> Tuple[str, str]:
    import yaml

    try:
        obj = yaml_safe.load(data.decode("utf-8", errors="replace"))
    except yaml_safe.Refused as exc:
        raise StoreValidationError(f"That YAML file can't be added: {exc}") from None
    except yaml.YAMLError:
        raise StoreValidationError("That file isn't valid YAML.") from None
    if obj is None:
        return "", ""
    if isinstance(obj, (dict, list)):
        return yaml.safe_dump(obj, default_flow_style=False, allow_unicode=True,
                              sort_keys=False), ""
    return str(obj), ""


def _from_docx(data: bytes) -> Tuple[str, str]:
    from docx import Document

    _check_docx_zip(data)
    try:
        document = Document(io.BytesIO(data))
    except Exception:
        raise StoreValidationError("Couldn't read that Word file.") from None
    parts = [p.text for p in document.paragraphs if p.text and p.text.strip()]
    for table in document.tables:
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells]
            line = " | ".join(c for c in cells if c)
            if line:
                parts.append(line)
    return "\n\n".join(parts), ""


def _check_docx_zip(data: bytes) -> None:
    """Refuse a .docx whose parts unzip past `MAX_DOCX_UNZIPPED` or number over
    `MAX_DOCX_PARTS` (a zip bomb), read from its directory before anything is inflated."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            members = archive.infolist()
    except (zipfile.BadZipFile, zipfile.LargeZipFile, OSError, ValueError):
        raise StoreValidationError("Couldn't read that Word file.") from None
    if len(members) > MAX_DOCX_PARTS:
        raise StoreValidationError("That Word file has too many parts to read.")
    if sum(member.file_size for member in members) > MAX_DOCX_UNZIPPED:
        raise StoreValidationError("That Word file unpacks to over 50 MB; add a smaller copy.")


def _from_pdf(data: bytes) -> Tuple[str, str]:
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(data))
    except Exception:
        raise StoreValidationError("Couldn't read that PDF.") from None
    if reader.is_encrypted:
        # A blank owner password may still open it; try, then give up cleanly.
        try:
            if reader.decrypt("") <= 0:  # 0 = failed
                raise StoreValidationError("That PDF is encrypted; add an unencrypted copy.")
        except StoreValidationError:
            raise
        except Exception:
            raise StoreValidationError("That PDF is encrypted; add an unencrypted copy.") from None
    parts = []
    total = 0
    cut = ""
    try:
        pages = reader.pages
        for number, page in enumerate(pages):
            if number >= MAX_PDF_PAGES:
                cut = CUT_PAGES
                break
            if total >= MAX_TEXT_CHARS:           # the text cap: later pages would be cut off
                cut = CUT_TEXT
                break
            text = page.extract_text() or ""
            if text.strip():
                parts.append(text)
                total += len(text) + 2
    except (RecursionError, MemoryError):
        raise
    except Exception:
        raise StoreValidationError("Couldn't read that PDF.") from None
    return "\n\n".join(parts), cut


_EXTRACTORS: Dict[str, Callable[[bytes], Tuple[str, str]]] = {
    "txt": _from_text,
    "md": _from_text,
    "json": _from_json,
    "yaml": _from_yaml,
    "docx": _from_docx,
    "pdf": _from_pdf,
}
