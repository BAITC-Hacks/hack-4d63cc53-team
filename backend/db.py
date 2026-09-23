from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from .schemas import blank_fields

class TaskRepository:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    @contextmanager
    def _connection(self):
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _initialize(self):
        with self._connection() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY, raw_description TEXT NOT NULL, fields_json TEXT NOT NULL,
                confirmed_json TEXT NOT NULL, revision INTEGER NOT NULL, publication_json TEXT,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL)""")

    def create(self, raw_description: str, fields: dict[str, str]) -> dict:
        now = utc_now()
        task_id = str(uuid4())
        all_fields = blank_fields()
        all_fields.update(fields)
        with self._connection() as db:
            db.execute(
                "INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (task_id, raw_description, json.dumps(all_fields), "[]", 1, None, now, now),
            )
        return self.get(task_id)

    def get(self, task_id: str) -> dict | None:
        with self._connection() as db:
            row = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return decode(row) if row else None

    def list(self) -> list[dict]:
        with self._connection() as db:
            rows = db.execute("SELECT * FROM tasks ORDER BY updated_at DESC").fetchall()
        return [decode(row) for row in rows]

    def mutate(self, task_id: str, expected_revision: int, callback) -> tuple[str, dict | None]:
        with self._connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
            if row is None:
                return "missing", None
            task = decode(row)
            if task["revision"] != expected_revision:
                return "stale", task
            task["updatedAt"] = utc_now()
            callback(task)
            task["revision"] += 1
            db.execute(
                "UPDATE tasks SET raw_description=?, fields_json=?, confirmed_json=?, revision=?, publication_json=?, updated_at=? WHERE id=?",
                (
                    task["rawDescription"],
                    json.dumps(task["fields"]),
                    json.dumps(task["confirmedFields"]),
                    task["revision"],
                    json.dumps(task["publication"]) if task["publication"] else None,
                    task["updatedAt"],
                    task_id,
                ),
            )
        return "ok", task

    def list_published_tasks(self) -> list[dict]:
        with self._connection() as db:
            rows = db.execute("SELECT publication_json FROM tasks WHERE publication_json IS NOT NULL").fetchall()
        return [json.loads(row[0]) for row in rows]

def decode(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "rawDescription": row["raw_description"],
        "fields": json.loads(row["fields_json"]),
        "confirmedFields": json.loads(row["confirmed_json"]),
        "revision": row["revision"],
        "publication": json.loads(row["publication_json"]) if row["publication_json"] else None,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }

def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()