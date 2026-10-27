"""The knowledge store: each file type, every refusal, the limits, the modes and redaction."""

import io
import json
import os
import stat

import pytest

from reconix import store
from reconix.store import knowledge
from reconix.store.knowledge import files, paths

from .support import TEST_PASSWORD


# --- fixtures for the binary file types ----------------------------------------------------
def _make_docx(path, paragraphs, table=None):
    from docx import Document

    document = Document()
    for para in paragraphs:
        document.add_paragraph(para)
    if table:
        t = document.add_table(rows=len(table), cols=len(table[0]))
        for r, row in enumerate(table):
            for c, value in enumerate(row):
                t.cell(r, c).text = value
    document.save(str(path))


def _pdf_bytes(text):
    """A minimal one-page PDF with a single text line (pypdf extracts it)."""
    content = b"BT /F1 24 Tf 72 700 Td (" + text.encode("latin-1") + b") Tj ET\n"
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"endstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(str(i).encode() + b" 0 obj\n" + body + b"\nendobj\n")
    xref = out.tell()
    out.write(b"xref\n0 " + str(len(objects) + 1).encode() + b"\n0000000000 65535 f \n")
    for off in offsets:
        out.write(("%010d 00000 n \n" % off).encode())
    out.write(b"trailer\n<< /Size " + str(len(objects) + 1).encode() + b" /Root 1 0 R >>\n")
    out.write(b"startxref\n" + str(xref).encode() + b"\n%%EOF")
    return out.getvalue()


# --- the file types ------------------------------------------------------------------------
def test_add_txt(tmp_path):
    p = tmp_path / "notes.txt"
    p.write_text("SQL injection was found in the search endpoint, marked high severity.")
    source = store.add_source(str(p))
    assert source.kind == "txt" and source.chunks >= 1 and source.bytes == p.stat().st_size
    assert [s.name for s in store.list_sources()] == ["notes.txt"]


def test_add_md(tmp_path):
    p = tmp_path / "runbook.md"
    p.write_text("# Runbook\n\nRotate the API keys after every penetration test engagement.")
    assert store.add_source(str(p)).kind == "md"


def test_add_json_stores_pretty_text(tmp_path):
    p = tmp_path / "config.json"
    p.write_text(json.dumps({"endpoint": "/search", "severity": "high"}))
    source = store.add_source(str(p))
    assert source.kind == "json"
    chunks = files.read_chunks(source.id)
    assert "endpoint" in chunks[0] and "/search" in chunks[0]


def test_add_yaml(tmp_path):
    p = tmp_path / "scope.yaml"
    p.write_text("target: staging.example.com\nmethods:\n  - GET\n  - POST\n")
    source = store.add_source(str(p))
    assert source.kind == "yaml"
    assert "staging.example.com" in files.read_chunks(source.id)[0]


def test_add_docx_paragraphs_and_tables(tmp_path):
    p = tmp_path / "report.docx"
    _make_docx(p, ["Executive summary of the engagement."],
               table=[["Severity", "Count"], ["High", "3"]])
    source = store.add_source(str(p))
    assert source.kind == "docx"
    text = " ".join(files.read_chunks(source.id))
    assert "Executive summary" in text and "Severity | Count" in text and "High | 3" in text


def test_add_pdf_page_text(tmp_path):
    p = tmp_path / "paper.pdf"
    p.write_bytes(_pdf_bytes("SQL injection reference material"))
    source = store.add_source(str(p))
    assert source.kind == "pdf"
    assert "SQL injection reference material" in files.read_chunks(source.id)[0]


# --- the refusals --------------------------------------------------------------------------
def test_refuse_empty_path():
    with pytest.raises(store.StoreValidationError):
        store.add_source("   ")


def test_refuse_missing_file(tmp_path):
    with pytest.raises(store.StoreValidationError):
        store.add_source(str(tmp_path / "nope.txt"))


def test_refuse_directory(tmp_path):
    with pytest.raises(store.StoreValidationError, match="regular file"):
        store.add_source(str(tmp_path))


def test_refuse_symlink(tmp_path):
    real = tmp_path / "real.txt"
    real.write_text("secret runbook contents here")
    link = tmp_path / "link.txt"
    link.symlink_to(real)
    with pytest.raises(store.StoreValidationError, match="symlink"):
        store.add_source(str(link))


def test_refuse_unknown_extension(tmp_path):
    p = tmp_path / "tool.exe"
    p.write_bytes(b"MZ binary")
    with pytest.raises(store.StoreValidationError, match="Unsupported"):
        store.add_source(str(p))


def test_refuse_too_large(tmp_path):
    p = tmp_path / "huge.txt"
    with open(p, "wb") as handle:
        handle.seek(10 * 1024 * 1024 + 1)
        handle.write(b"x")
    with pytest.raises(store.StoreValidationError, match="too large"):
        store.add_source(str(p))


def test_refuse_invalid_json(tmp_path):
    p = tmp_path / "bad.json"
    p.write_text("{not valid json,,,}")
    with pytest.raises(store.StoreValidationError, match="valid JSON"):
        store.add_source(str(p))


def test_refuse_encrypted_pdf(tmp_path):
    from pypdf import PdfReader, PdfWriter

    writer = PdfWriter()
    writer.append(PdfReader(io.BytesIO(_pdf_bytes("secret page"))))
    writer.encrypt("open-sesame")
    p = tmp_path / "locked.pdf"
    with open(p, "wb") as handle:
        writer.write(handle)
    with pytest.raises(store.StoreValidationError, match="encrypted"):
        store.add_source(str(p))


def test_refuse_unreadable_pdf(tmp_path):
    p = tmp_path / "broken.pdf"
    p.write_bytes(b"%PDF-1.4 this is not really a pdf")
    with pytest.raises(store.StoreValidationError, match="PDF"):
        store.add_source(str(p))


def test_refuse_file_with_no_text(tmp_path):
    p = tmp_path / "empty.txt"
    p.write_text("   \n\n   ")
    with pytest.raises(store.StoreValidationError, match="no readable text"):
        store.add_source(str(p))


# --- the limits ----------------------------------------------------------------------------
def test_source_limit(tmp_path):
    for i in range(files.MAX_SOURCES):
        p = tmp_path / f"f{i}.txt"
        p.write_text(f"reference document number {i} about scope and findings")
        store.add_source(str(p))
    assert len(store.list_sources()) == files.MAX_SOURCES
    over = tmp_path / "over.txt"
    over.write_text("one more document")
    with pytest.raises(store.StoreValidationError, match="limit"):
        store.add_source(str(over))


def test_passage_cap(tmp_path, monkeypatch):
    # A document with more paragraphs than the cap keeps at most MAX_PASSAGES.
    import sys

    import reconix.store.knowledge.chunk  # noqa: F401  (ensure the submodule is imported)
    chunk_mod = sys.modules["reconix.store.knowledge.chunk"]
    monkeypatch.setattr(chunk_mod, "MAX_PASSAGES", 5)
    big = "\n\n".join(f"paragraph {i} " + "word " * 300 for i in range(20))
    p = tmp_path / "big.txt"
    p.write_text(big)
    source = store.add_source(str(p))
    assert source.chunks == 5


# --- the modes -----------------------------------------------------------------------------
def test_folder_and_files_are_private(tmp_path):
    p = tmp_path / "notes.txt"
    p.write_text("reference material for the assessment")
    source = store.add_source(str(p))
    folder = paths.knowledge_dir()
    assert stat.S_IMODE(os.stat(folder).st_mode) == 0o700
    assert stat.S_IMODE(os.stat(files.index_path()).st_mode) == 0o600
    assert stat.S_IMODE(os.stat(files.source_path(source.id)).st_mode) == 0o600


# --- redaction at ingest -------------------------------------------------------------------
def test_secret_is_masked_on_disk(tmp_path):
    p = tmp_path / "creds.txt"
    p.write_text(f"The admin login uses password={TEST_PASSWORD} on the staging box.")
    source = store.add_source(str(p))
    on_disk = files.source_path(source.id).read_text(encoding="utf-8")
    assert TEST_PASSWORD not in on_disk
    assert TEST_PASSWORD not in files.index_path().read_text(encoding="utf-8")
    assert TEST_PASSWORD not in " ".join(files.read_chunks(source.id))


# --- remove / clear ------------------------------------------------------------------------
def test_remove_source(tmp_path):
    p = tmp_path / "a.txt"
    p.write_text("one reference document")
    source = store.add_source(str(p))
    store.remove_source(source.id)
    assert store.list_sources() == []
    assert not files.source_path(source.id).exists()


def test_remove_unknown_raises(tmp_path):
    with pytest.raises(store.StoreValidationError, match="Unknown add-on"):
        store.remove_source("0" * 32)


def test_clear_removes_everything(tmp_path):
    for name in ("a.txt", "b.txt"):
        p = tmp_path / name
        p.write_text(f"document {name}")
        store.add_source(str(p))
    store.clear_knowledge()
    assert store.list_sources() == []
    assert not files.index_path().exists()


# --- a corrupt index -----------------------------------------------------------------------
def test_corrupt_index_gives_a_clear_error(tmp_path):
    paths.ensure_dir()
    files.index_path().write_text("this is not json at all", encoding="utf-8")
    with pytest.raises(store.StoreValidationError, match="corrupt"):
        store.list_sources()
    # search never crashes the chat on a corrupt index.
    assert store.search_knowledge("anything") == []


def test_wrong_format_string_is_corrupt(tmp_path):
    paths.ensure_dir()
    files.index_path().write_text(json.dumps({"format": "other/v9", "sources": []}),
                                  encoding="utf-8")
    with pytest.raises(store.StoreValidationError, match="corrupt"):
        store.list_sources()


# --- search across sources -----------------------------------------------------------------
def test_search_returns_passage_objects(tmp_path):
    corpus = {
        "runbook.md": "SQL injection was found in the search endpoint and marked high severity.",
        "policy.txt": "Scope approval requires a signed authorization from the system owner.",
        "notes.md": "The login form accepts an email and a password over HTTPS only.",
    }
    for name, text in corpus.items():
        p = tmp_path / name
        p.write_text(text)
        store.add_source(str(p))
    hits = store.search_knowledge("sql injection severity endpoint search")
    assert hits and hits[0].source == "runbook.md"
    assert isinstance(hits[0], knowledge.Passage)
    assert hits[0].score > 0


# --- parser failures are refusals, never crashes -------------------------------------------
def _extract_module():
    """The extract submodule (the package re-exports its `extract` function by that name)."""
    import sys

    return sys.modules["reconix.store.knowledge.extract"]


@pytest.mark.parametrize("error, words", [
    (RecursionError, "nested too deeply"),
    (MemoryError, "too large to read"),
    (OSError, "Couldn't read that JSON file"),
    (ValueError, "Couldn't read that JSON file"),
])
def test_a_parser_failure_becomes_a_clear_refusal(tmp_path, monkeypatch, error, words):
    extract = _extract_module()

    def boom(data):
        raise error("parser blew up")

    monkeypatch.setitem(extract._EXTRACTORS, "json", boom)
    p = tmp_path / "data.json"
    p.write_text("{}")
    with pytest.raises(store.StoreValidationError, match=words):
        store.add_source(str(p))


def test_deeply_nested_json_is_refused(tmp_path):
    p = tmp_path / "deep.json"
    p.write_text("[" * 200_000 + "]" * 200_000)
    with pytest.raises(store.StoreValidationError, match="nested too deeply"):
        store.add_source(str(p))


def test_a_huge_yaml_integer_is_refused(tmp_path):
    p = tmp_path / "big.yaml"
    p.write_text("n: " + "9" * 10_000 + "\n")        # int() refuses it with a ValueError
    with pytest.raises(store.StoreValidationError, match="YAML"):
        store.add_source(str(p))


def test_a_path_with_a_nul_is_refused():
    with pytest.raises(store.StoreValidationError, match="valid path"):
        store.add_source("/tmp/a\x00b.txt")


def test_a_fifo_is_refused_without_blocking(tmp_path):
    fifo = tmp_path / "pipe.txt"
    os.mkfifo(fifo)
    with pytest.raises(store.StoreValidationError, match="regular file"):
        store.add_source(str(fifo))


# --- the extraction caps -------------------------------------------------------------------
def _zip(path, members):
    import zipfile

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in members:
            archive.writestr(name, data)


def test_a_docx_that_unzips_past_50_mb_is_refused(tmp_path):
    p = tmp_path / "bomb.docx"
    _zip(p, [("word/document.xml", b"\0" * (51 * 1024 * 1024))])
    assert p.stat().st_size < 1024 * 1024                  # small on disk
    with pytest.raises(store.StoreValidationError, match="over 50 MB"):
        store.add_source(str(p))


def test_a_docx_with_too_many_parts_is_refused(tmp_path):
    p = tmp_path / "parts.docx"
    _zip(p, [(f"part{i}.xml", b"x") for i in range(2001)])
    with pytest.raises(store.StoreValidationError, match="too many parts"):
        store.add_source(str(p))


def test_a_docx_that_is_not_a_zip_is_refused(tmp_path):
    p = tmp_path / "fake.docx"
    p.write_bytes(b"not a zip at all")
    with pytest.raises(store.StoreValidationError, match="Word file"):
        store.add_source(str(p))


def _two_page_pdf(tmp_path):
    from pypdf import PdfReader, PdfWriter

    writer = PdfWriter()
    writer.append(PdfReader(io.BytesIO(_pdf_bytes("first page reference text"))))
    writer.append(PdfReader(io.BytesIO(_pdf_bytes("second page appendix words"))))
    p = tmp_path / "two.pdf"
    with open(p, "wb") as handle:
        writer.write(handle)
    return p


def test_pdf_pages_stop_at_the_page_cap(tmp_path, monkeypatch):
    extract = _extract_module()

    monkeypatch.setattr(extract, "MAX_PDF_PAGES", 1)
    source = store.add_source(str(_two_page_pdf(tmp_path)))
    text = " ".join(files.read_chunks(source.id))
    assert "first page" in text and "second page" not in text
    assert source.cut == extract.CUT_PAGES


def test_pdf_pages_stop_once_the_text_cap_is_reached(tmp_path, monkeypatch):
    from pypdf import PageObject

    extract = _extract_module()

    monkeypatch.setattr(extract, "MAX_TEXT_CHARS", 10)
    extracted = []
    real = PageObject.extract_text

    def counting(page, *args, **kwargs):
        extracted.append(page)
        return real(page, *args, **kwargs)

    monkeypatch.setattr(PageObject, "extract_text", counting)
    source = store.add_source(str(_two_page_pdf(tmp_path)))
    assert len(extracted) == 1                              # page 2 was never extracted
    assert source.cut == extract.CUT_TEXT


def test_the_text_cap_is_reported(tmp_path, monkeypatch):
    extract = _extract_module()

    monkeypatch.setattr(extract, "MAX_TEXT_CHARS", 50)
    p = tmp_path / "long.txt"
    p.write_text("reference words " * 20)
    assert store.add_source(str(p)).cut == "cut to the first 2 MB of text"


def test_the_passage_cap_is_reported(tmp_path, monkeypatch):
    import sys

    monkeypatch.setattr(sys.modules["reconix.store.knowledge.chunk"], "MAX_PASSAGES", 5)
    p = tmp_path / "big.txt"
    p.write_text("\n\n".join(f"paragraph {i} " + "word " * 300 for i in range(20)))
    source = store.add_source(str(p))
    assert source.chunks == 5 and source.cut == "cut to the first 5 passages"
    small = tmp_path / "small.txt"
    small.write_text("a short reference document")
    assert store.add_source(str(small)).cut == ""


# --- the name is cleaned and redacted at ingest --------------------------------------------
def test_the_source_name_is_cleaned_redacted_and_capped(tmp_path):
    p = tmp_path / f"password={TEST_PASSWORD} \x1b[31mred\nline.txt"
    p.write_text("reference material for the assessment")
    source = store.add_source(str(p))
    assert TEST_PASSWORD not in source.name and "password=••••" in source.name
    assert "\x1b" not in source.name and "\n" not in source.name
    assert TEST_PASSWORD not in files.index_path().read_text(encoding="utf-8")
    assert TEST_PASSWORD not in files.source_path(source.id).read_text(encoding="utf-8")

    long = tmp_path / ("n" * 200 + ".md")
    long.write_text("another reference document")
    assert len(store.add_source(str(long)).name) == 120


# --- nothing is left behind on a refusal ---------------------------------------------------
def _json_files():
    return sorted(f.name for f in paths.knowledge_dir().glob("*.json"))


def test_the_50_source_limit_leaves_nothing_new_on_disk(tmp_path):
    for i in range(files.MAX_SOURCES):
        p = tmp_path / f"f{i}.txt"
        p.write_text(f"reference document number {i}")
        store.add_source(str(p))
    before = _json_files()
    assert len(before) == files.MAX_SOURCES + 1               # the sources and the index
    over = tmp_path / "over.txt"
    over.write_text("one more document")
    with pytest.raises(store.StoreValidationError, match="limit is 50"):
        store.add_source(str(over))
    assert _json_files() == before


def test_a_failed_index_write_removes_the_new_source_file(tmp_path, monkeypatch):
    p = tmp_path / "a.txt"
    p.write_text("reference document")
    store.add_source(str(p))
    before = _json_files()

    def broken(sources):
        raise PermissionError("read-only folder")

    monkeypatch.setattr(files, "write_index", broken)
    q = tmp_path / "b.txt"
    q.write_text("another reference document")
    with pytest.raises(store.StoreValidationError, match="Couldn't save"):
        store.add_source(str(q))
    assert _json_files() == before                         # no orphan <id>.json


# --- careful reads -------------------------------------------------------------------------
def _one_source(tmp_path, name="a.txt", text="SQL injection reference for the search page"):
    p = tmp_path / name
    p.write_text(text)
    return store.add_source(str(p))


def test_a_symlinked_index_is_not_read(tmp_path):
    _one_source(tmp_path)
    real = tmp_path / "elsewhere.json"
    real.write_bytes(files.index_path().read_bytes())
    files.index_path().unlink()
    files.index_path().symlink_to(real)
    with pytest.raises(store.StoreValidationError, match="corrupt"):
        store.list_sources()


def test_an_index_writable_by_others_is_not_read(tmp_path):
    _one_source(tmp_path)
    os.chmod(files.index_path(), 0o622)
    with pytest.raises(store.StoreValidationError, match="corrupt"):
        store.list_sources()


def test_an_index_over_its_cap_is_not_read(tmp_path, monkeypatch):
    _one_source(tmp_path)
    monkeypatch.setattr(files, "MAX_INDEX_BYTES", 10)
    with pytest.raises(store.StoreValidationError, match="corrupt"):
        store.list_sources()


def test_a_source_file_over_its_cap_is_refused(tmp_path, monkeypatch):
    source = _one_source(tmp_path)
    monkeypatch.setattr(files, "MAX_SOURCE_BYTES", 10)
    with pytest.raises(store.StoreValidationError, match="corrupt"):
        files.read_chunks(source.id)


def test_search_skips_a_corrupt_source_and_ranks_over_the_rest(tmp_path):
    from reconix.store.knowledge import rank

    good = _one_source(tmp_path, "good.md", "SQL injection was found in the search endpoint.")
    bad = _one_source(tmp_path, "bad.md", "SQL injection notes for the search endpoint too.")
    other = _one_source(tmp_path, "other.md", "Scope approval needs the owner's signature.")
    files.source_path(bad.id).write_text("{ not json", encoding="utf-8")

    hits = store.search_knowledge("sql injection search endpoint")
    assert [h.source for h in hits] == ["good.md"]
    # N and avgdl count only the readable sources: the same as ranking those two alone.
    alone = rank.rank([("good.md", 0, files.read_chunks(good.id)[0]),
                       ("other.md", 0, files.read_chunks(other.id)[0])],
                      "sql injection search endpoint")
    assert [round(h.score, 6) for h in hits] == [round(h.score, 6) for h in alone]


# --- remove all, even when the index is unreadable -----------------------------------------
def test_clear_removes_every_source_file_even_with_a_corrupt_index(tmp_path):
    for name in ("a.txt", "b.txt"):
        _one_source(tmp_path, name, f"reference document {name}")
    folder = paths.knowledge_dir()
    (folder / "keep-me.txt").write_text("not ours")
    files.index_path().write_text("garbage", encoding="utf-8")

    assert store.clear_knowledge() == 2
    assert _json_files() == []
    assert (folder / "keep-me.txt").exists()                 # only <id>.json and the index
