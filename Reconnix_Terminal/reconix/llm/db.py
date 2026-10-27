"""Flexible LLM: the single SQLite file (providers, active model, chat history, switches).

stdlib ``sqlite3`` only. The schema is created on first use, foreign keys are on, the DB
file is 0600, and every query is parameterized. Encrypted API-key tokens live in the
``providers.api_key_enc`` BLOB; the plaintext never touches this module.
"""

import sqlite3
from typing import Any, Dict, List, Optional

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS providers (
    provider_id    TEXT PRIMARY KEY,
    api_key_enc    BLOB,
    api_key_hint   TEXT,
    base_url       TEXT,
    models_json    TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'UNTESTED'
                   CHECK (status IN ('UNTESTED', 'REACHABLE', 'UNREACHABLE')),
    status_detail  TEXT,
    tested_at      TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS active_model (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    provider_id   TEXT REFERENCES providers(provider_id) ON DELETE SET NULL,
    model         TEXT,
    activated_at  TEXT
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    assessment_uid  TEXT NOT NULL,
    seq             INTEGER NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'note')),
    content         TEXT NOT NULL,
    provider_id     TEXT,
    model           TEXT,
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_by_assessment ON chat_messages(assessment_uid, seq);

CREATE TABLE IF NOT EXISTS model_switches (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    assessment_uid  TEXT,
    from_provider   TEXT, from_model TEXT,
    to_provider     TEXT NOT NULL, to_model TEXT NOT NULL,
    switched_at     TEXT NOT NULL
);
"""


def connect() -> sqlite3.Connection:
    """Open the DB (creating the schema and tightening perms on first use)."""
    path = config.DB_PATH
    first = not path.exists()
    if first:
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    conn.commit()
    try:
        path.chmod(0o600)          # keep 0600 even if the file pre-existed with loose perms
    except OSError:
        pass
    return conn


# --- providers --------------------------------------------------------------------

def get_provider_row(provider_id: str) -> Optional[sqlite3.Row]:
    with connect() as conn:
        return conn.execute(
            "SELECT * FROM providers WHERE provider_id = ?", (provider_id,)
        ).fetchone()


def all_provider_rows() -> Dict[str, sqlite3.Row]:
    with connect() as conn:
        rows = conn.execute("SELECT * FROM providers").fetchall()
    return {row["provider_id"]: row for row in rows}


def upsert_provider(provider_id: str, fields: Dict[str, Any], now: str) -> None:
    """Insert a new provider row or update the existing one (same primary key)."""
    with connect() as conn:
        exists = conn.execute(
            "SELECT 1 FROM providers WHERE provider_id = ?", (provider_id,)
        ).fetchone()
        if exists:
            cols = ", ".join(f"{k} = ?" for k in fields)
            conn.execute(
                f"UPDATE providers SET {cols}, updated_at = ? WHERE provider_id = ?",
                (*fields.values(), now, provider_id),
            )
        else:
            fields = {**fields, "provider_id": provider_id,
                      "created_at": now, "updated_at": now}
            cols = ", ".join(fields)
            marks = ", ".join("?" for _ in fields)
            conn.execute(
                f"INSERT INTO providers ({cols}) VALUES ({marks})", tuple(fields.values())
            )
        conn.commit()


def delete_provider(provider_id: str) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM providers WHERE provider_id = ?", (provider_id,))
        # ON DELETE SET NULL clears active_model.provider_id; drop the stale row entirely.
        conn.execute(
            "DELETE FROM active_model WHERE provider_id IS NULL OR provider_id = ?",
            (provider_id,),
        )
        conn.commit()


# --- active model -----------------------------------------------------------------

def get_active() -> Optional[sqlite3.Row]:
    with connect() as conn:
        return conn.execute(
            "SELECT * FROM active_model WHERE id = 1 AND provider_id IS NOT NULL"
        ).fetchone()


def set_active(provider_id: str, model: str, now: str) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO active_model (id, provider_id, model, activated_at) "
            "VALUES (1, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET provider_id = ?, model = ?, activated_at = ?",
            (provider_id, model, now, provider_id, model, now),
        )
        conn.commit()


def clear_active() -> None:
    with connect() as conn:
        conn.execute("DELETE FROM active_model WHERE id = 1")
        conn.commit()


# --- chat history & switches ------------------------------------------------------

def add_chat_message(assessment_uid: str, seq: int, role: str, content: str,
                     provider_id: Optional[str], model: Optional[str], now: str) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO chat_messages "
            "(assessment_uid, seq, role, content, provider_id, model, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (assessment_uid, seq, role, content, provider_id, model, now),
        )
        conn.commit()


def list_chat_messages(assessment_uid: str) -> List[sqlite3.Row]:
    with connect() as conn:
        return conn.execute(
            "SELECT * FROM chat_messages WHERE assessment_uid = ? ORDER BY seq",
            (assessment_uid,),
        ).fetchall()


def add_switch(assessment_uid: Optional[str], from_provider: Optional[str],
               from_model: Optional[str], to_provider: str, to_model: str,
               now: str) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO model_switches "
            "(assessment_uid, from_provider, from_model, to_provider, to_model, switched_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (assessment_uid, from_provider, from_model, to_provider, to_model, now),
        )
        conn.commit()
