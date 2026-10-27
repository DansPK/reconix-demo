"""SQLite persistence. The canonical store the UI reads from.

A fresh connection is opened per operation so methods are safe to call from
Textual worker threads (sqlite3 connections are not shareable across threads).
Low volume for a PoC, so the overhead is irrelevant.
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from .models import Finding, ScanResult, Severity, Target, TargetType

SCHEMA = """
CREATE TABLE IF NOT EXISTS targets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,
    value       TEXT NOT NULL,
    authorized  INTEGER NOT NULL DEFAULT 0,
    scope       TEXT NOT NULL DEFAULT '[]',
    created_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scans (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    target_id     INTEGER NOT NULL,
    scanner       TEXT NOT NULL,
    status        TEXT NOT NULL,
    raw_output    TEXT NOT NULL DEFAULT '',
    error         TEXT NOT NULL DEFAULT '',
    started_at    TEXT NOT NULL,
    completed_at  TEXT,
    FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS findings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id      INTEGER NOT NULL,
    severity     TEXT NOT NULL,
    title        TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    evidence     TEXT NOT NULL DEFAULT '',
    location     TEXT NOT NULL DEFAULT '',
    cve_id       TEXT,
    cvss_score   REAL,
    verified     INTEGER NOT NULL DEFAULT 0,
    ai_analysis  TEXT,
    FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Database:
    def __init__(self, path: Path | str):
        self.path = str(path)
        self.init()

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def init(self) -> None:
        with self._conn() as conn:
            conn.executescript(SCHEMA)

    # --- targets -----------------------------------------------------------
    def add_target(self, target: Target) -> int:
        with self._conn() as conn:
            cur = conn.execute(
                "INSERT INTO targets (name, type, value, authorized, scope, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    target.name,
                    target.type.value,
                    target.value,
                    int(target.authorized),
                    json.dumps(target.scope),
                    target.created_at,
                ),
            )
            return int(cur.lastrowid)

    def list_targets(self) -> list[Target]:
        with self._conn() as conn:
            rows = conn.execute("SELECT * FROM targets ORDER BY id DESC").fetchall()
        return [self._row_to_target(r) for r in rows]

    def get_target(self, target_id: int) -> Target | None:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM targets WHERE id = ?", (target_id,)).fetchone()
        return self._row_to_target(row) if row else None

    @staticmethod
    def _row_to_target(row: sqlite3.Row) -> Target:
        return Target(
            id=row["id"],
            name=row["name"],
            type=TargetType(row["type"]),
            value=row["value"],
            authorized=bool(row["authorized"]),
            scope=json.loads(row["scope"] or "[]"),
            created_at=row["created_at"],
        )

    # --- scans -------------------------------------------------------------
    def create_scan(self, target_id: int, scanner: str, status: str = "running") -> int:
        with self._conn() as conn:
            cur = conn.execute(
                "INSERT INTO scans (target_id, scanner, status, started_at) VALUES (?, ?, ?, ?)",
                (target_id, scanner, status, _now()),
            )
            return int(cur.lastrowid)

    def finish_scan(self, scan_id: int, status: str, raw_output: str = "", error: str = "") -> None:
        with self._conn() as conn:
            conn.execute(
                "UPDATE scans SET status = ?, raw_output = ?, error = ?, completed_at = ? WHERE id = ?",
                (status, raw_output, error, _now(), scan_id),
            )

    # --- findings ----------------------------------------------------------
    def add_finding(self, f: Finding) -> int:
        with self._conn() as conn:
            cur = conn.execute(
                "INSERT INTO findings (scan_id, severity, title, description, evidence, "
                "location, cve_id, cvss_score, verified, ai_analysis) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    f.scan_id,
                    f.severity.value,
                    f.title,
                    f.description,
                    f.evidence,
                    f.location,
                    f.cve_id,
                    f.cvss_score,
                    int(f.verified),
                    f.ai_analysis,
                ),
            )
            return int(cur.lastrowid)

    def set_finding_analysis(self, finding_id: int, analysis: str) -> None:
        with self._conn() as conn:
            conn.execute("UPDATE findings SET ai_analysis = ? WHERE id = ?", (analysis, finding_id))

    def findings_for_target(self, target_id: int) -> list[Finding]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT f.* FROM findings f JOIN scans s ON f.scan_id = s.id "
                "WHERE s.target_id = ? ORDER BY f.id DESC",
                (target_id,),
            ).fetchall()
        findings = (self._row_to_finding(r) for r in rows)
        return [f for f in findings if f is not None]   # old Info rows are hidden

    @staticmethod
    def _row_to_finding(row: sqlite3.Row) -> Finding | None:
        """The row as a Finding, or None when its severity isn't reportable (an old Info row,
        an unknown value), so a returned Finding's severity is always a real `Severity`."""
        severity = Severity.coerce(row["severity"])
        if severity is None:
            return None
        return Finding(
            id=row["id"],
            scan_id=row["scan_id"],
            severity=severity,
            title=row["title"],
            description=row["description"],
            evidence=row["evidence"],
            location=row["location"],
            cve_id=row["cve_id"],
            cvss_score=row["cvss_score"],
            verified=bool(row["verified"]),
            ai_analysis=row["ai_analysis"],
        )

    def persist_result(self, result: ScanResult) -> None:
        """Store a completed ScanResult's findings (scan row already exists)."""
        for f in result.findings:
            f.scan_id = result.id or f.scan_id
            self.add_finding(f)
