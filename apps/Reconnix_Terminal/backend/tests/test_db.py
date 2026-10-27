"""Reading findings back from SQLite: a row whose severity isn't reportable never comes back.

`Finding.severity` is typed `Severity`, so an old Info row (or an unknown value written by an
older build) is dropped when it is read instead of surfacing as a Finding with None.
"""

from __future__ import annotations

import sqlite3

from harness.db import Database
from harness.models import Finding, Severity, Target, TargetType


def test_rows_with_a_non_reportable_severity_are_dropped_on_read(tmp_path):
    db = Database(tmp_path / "t.db")
    tid = db.add_target(Target(name="shop", type=TargetType.WEB, value="http://10.0.0.5"))
    scan = db.create_scan(tid, "nuclei")
    db.add_finding(Finding(scan_id=scan, severity=Severity.HIGH, title="SQL injection"))
    with sqlite3.connect(tmp_path / "t.db") as conn:      # rows an older build could leave
        for value in ("info", "bogus", ""):
            conn.execute("INSERT INTO findings (scan_id, severity, title) VALUES (?, ?, ?)",
                         (scan, value, f"old {value or 'empty'} row"))

    findings = db.findings_for_target(tid)
    assert [f.title for f in findings] == ["SQL injection"]
    assert all(isinstance(f.severity, Severity) for f in findings)
