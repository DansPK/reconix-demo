"""SQLite storage. One short-lived connection per call keeps it safe across threads."""

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, target_type TEXT NOT NULL,
    repo_url TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_commit TEXT);
CREATE INDEX IF NOT EXISTS sessions_owner ON sessions(owner);
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL,
    text TEXT NOT NULL, finding_ids TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS messages_session ON messages(session_id, id);
CREATE TABLE IF NOT EXISTS manifest_files (
    session_id TEXT NOT NULL, path TEXT NOT NULL, sha256 TEXT NOT NULL, size INTEGER NOT NULL,
    PRIMARY KEY (session_id, path));
CREATE TABLE IF NOT EXISTS pending_manifests (
    session_id TEXT PRIMARY KEY, manifest TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL,
    expires_at REAL NOT NULL, used INTEGER NOT NULL DEFAULT 0, path TEXT);
CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, status TEXT NOT NULL, stage TEXT NOT NULL,
    percent INTEGER NOT NULL DEFAULT 0, counts TEXT NOT NULL DEFAULT '{}', error TEXT,
    started_at TEXT, finished_at TEXT, created_at TEXT NOT NULL, message TEXT);
CREATE INDEX IF NOT EXISTS scans_session ON scans(session_id, created_at);
CREATE TABLE IF NOT EXISTS findings (
    scan_id TEXT NOT NULL, id TEXT NOT NULL, session_id TEXT NOT NULL, severity TEXT NOT NULL,
    path TEXT NOT NULL, tools TEXT NOT NULL, data TEXT NOT NULL, masks TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (scan_id, id));
CREATE INDEX IF NOT EXISTS findings_session ON findings(session_id);
-- Reviews are cached per model too, so switching LLM_MODEL reviews findings again.
-- llm_reviews was the cache before the model was part of the key.
DROP TABLE IF EXISTS llm_reviews;
CREATE TABLE IF NOT EXISTS review_cache (
    finding_id TEXT NOT NULL, file_sha256 TEXT NOT NULL, model TEXT NOT NULL, verdict TEXT NOT NULL,
    explanation TEXT NOT NULL, fix_recommendation TEXT NOT NULL, suggested_patch TEXT,
    PRIMARY KEY (finding_id, file_sha256, model));
-- Flexible LLM model: configured providers and the single global active model.
-- API keys are Fernet-encrypted (api_key_enc); only a safe hint is ever returned.
CREATE TABLE IF NOT EXISTS providers (
    provider_id TEXT PRIMARY KEY, api_key_enc BLOB, api_key_hint TEXT, base_url TEXT,
    models_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'UNTESTED',
    status_detail TEXT, tested_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS active_model (
    id INTEGER PRIMARY KEY CHECK (id = 1), provider_id TEXT, model TEXT, activated_at TEXT);
"""


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class DB:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.conn() as c:
            c.execute("PRAGMA journal_mode=WAL")
            c.executescript(SCHEMA)

    @contextmanager
    def conn(self):
        c = sqlite3.connect(self.path, timeout=30)
        c.row_factory = sqlite3.Row
        try:
            with c:
                yield c
        finally:
            c.close()

    def all(self, sql, args=()):
        with self.conn() as c:
            return [dict(r) for r in c.execute(sql, args).fetchall()]

    def one(self, sql, args=()):
        rows = self.all(sql, args)
        return rows[0] if rows else None

    def run(self, sql, args=()):
        with self.conn() as c:
            return c.execute(sql, args).rowcount

    def many(self, sql, rows):
        with self.conn() as c:
            c.executemany(sql, rows)

    # --- review cache ---

    def get_review(self, finding_id, file_sha256, model):
        return self.one("SELECT verdict, explanation, fix_recommendation, suggested_patch FROM review_cache "
                        "WHERE finding_id=? AND file_sha256=? AND model=?", (finding_id, file_sha256, model))

    def put_review(self, finding_id, file_sha256, model, review):
        self.run("INSERT OR REPLACE INTO review_cache VALUES (?,?,?,?,?,?,?)",
                 (finding_id, file_sha256, model, review["verdict"], review["explanation"],
                  review["fix_recommendation"], review.get("suggested_patch")))

    # --- LLM providers / active model ---

    _PROVIDER_COLS = ("api_key_enc", "api_key_hint", "base_url", "models_json",
                      "status", "status_detail", "tested_at")

    def get_provider(self, provider_id):
        return self.one("SELECT * FROM providers WHERE provider_id=?", (provider_id,))

    def all_providers(self):
        return {r["provider_id"]: r for r in self.all("SELECT * FROM providers")}

    def upsert_provider(self, provider_id, fields, ts):
        """Insert or update a provider row, setting only the given columns."""
        with self.conn() as c:
            row = c.execute("SELECT 1 FROM providers WHERE provider_id=?", (provider_id,)).fetchone()
            cols = [k for k in self._PROVIDER_COLS if k in fields]
            if row is None:
                names = ["provider_id", *cols, "created_at", "updated_at"]
                vals = [provider_id, *(fields[k] for k in cols), ts, ts]
                c.execute(f"INSERT INTO providers ({', '.join(names)}) "
                          f"VALUES ({', '.join('?' * len(names))})", vals)
            else:
                sets = ", ".join(f"{k}=?" for k in cols) + ", updated_at=?"
                c.execute(f"UPDATE providers SET {sets} WHERE provider_id=?",
                          (*(fields[k] for k in cols), ts, provider_id))

    def delete_provider(self, provider_id):
        self.run("DELETE FROM providers WHERE provider_id=?", (provider_id,))

    def get_active(self):
        row = self.one("SELECT provider_id, model, activated_at FROM active_model WHERE id=1")
        return row if row and row["provider_id"] else None

    def set_active(self, provider_id, model, ts):
        self.run("INSERT OR REPLACE INTO active_model (id, provider_id, model, activated_at) "
                 "VALUES (1,?,?,?)", (provider_id, model, ts))

    # --- findings ---

    def save_findings(self, scan_id, session_id, findings, replace=False):
        """Store a scan's findings. With replace, the scan's earlier rows go first, in the same
        transaction, so a reader never sees a half-written list."""
        rows = [
            (scan_id, f["id"], session_id, f["severity"], f["path"], json.dumps(f["tools"]),
             json.dumps({k: v for k, v in f.items() if not k.startswith("_")}),
             json.dumps(f.get("_mask", [])))
            for f in findings]
        with self.conn() as c:
            if replace:
                c.execute("DELETE FROM findings WHERE scan_id=?", (scan_id,))
            c.executemany("INSERT OR REPLACE INTO findings VALUES (?,?,?,?,?,?,?,?)", rows)

    def update_finding(self, scan_id, finding):
        self.run("UPDATE findings SET data=? WHERE scan_id=? AND id=?",
                 (json.dumps({k: v for k, v in finding.items() if not k.startswith("_")}), scan_id, finding["id"]))

    def load_findings(self, scan_id, with_masks=False):
        rows = self.all("SELECT data, masks FROM findings WHERE scan_id=?", (scan_id,))
        out = []
        for r in rows:
            f = json.loads(r["data"])
            if with_masks:
                f["_mask"] = [tuple(s) for s in json.loads(r["masks"])]
            out.append(f)
        return out
