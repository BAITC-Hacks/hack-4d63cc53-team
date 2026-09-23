from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


class MarketplaceRepository:
    """SQLite storage isolated from the task tables owned by participant 2."""

    def __init__(self, path: Path):
        self.path = path
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
            db.executescript("""
                CREATE TABLE IF NOT EXISTS marketplace_teams (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, interests_json TEXT NOT NULL,
                    skills_json TEXT NOT NULL, technologies_json TEXT NOT NULL,
                    progress_points INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS marketplace_proposals (
                    id TEXT PRIMARY KEY, task_id TEXT NOT NULL, team_id TEXT NOT NULL,
                    idea TEXT NOT NULL, plan TEXT NOT NULL, deadline TEXT NOT NULL,
                    prototype_url TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS marketplace_milestones (
                    id TEXT PRIMARY KEY, task_id TEXT NOT NULL, team_id TEXT NOT NULL,
                    description TEXT NOT NULL, evidence TEXT NOT NULL, confirmed_at TEXT,
                    points_awarded INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
                );
            """)

    def create_team(self, values: dict) -> dict:
        team = {"id": str(uuid4()), **values, "progressPoints": 0, "createdAt": utc_now()}
        with self._connection() as db:
            db.execute("INSERT INTO marketplace_teams VALUES (?, ?, ?, ?, ?, ?, ?)", (
                team["id"], team["name"], json.dumps(team["interests"]), json.dumps(team["skills"]),
                json.dumps(team["technologies"]), 0, team["createdAt"],
            ))
        return team

    def list_teams(self) -> list[dict]:
        with self._connection() as db:
            rows = db.execute("SELECT * FROM marketplace_teams ORDER BY name COLLATE NOCASE").fetchall()
        return [decode_team(row) for row in rows]

    def get_team(self, team_id: str) -> dict | None:
        with self._connection() as db:
            row = db.execute("SELECT * FROM marketplace_teams WHERE id = ?", (team_id,)).fetchone()
        return decode_team(row) if row else None

    def create_proposal(self, values: dict) -> dict:
        proposal = {"id": str(uuid4()), **values, "status": "pending", "createdAt": utc_now()}
        with self._connection() as db:
            db.execute("INSERT INTO marketplace_proposals VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", (
                proposal["id"], proposal["taskId"], proposal["teamId"], proposal["idea"], proposal["plan"],
                proposal["deadline"], proposal.get("prototypeUrl"), proposal["status"], proposal["createdAt"],
            ))
        return proposal

    def list_proposals(self, task_id: str) -> list[dict]:
        with self._connection() as db:
            rows = db.execute("""SELECT p.*, t.name AS team_name, t.interests_json, t.skills_json,
                t.technologies_json, t.progress_points FROM marketplace_proposals p
                JOIN marketplace_teams t ON t.id = p.team_id WHERE p.task_id = ? ORDER BY p.created_at DESC""", (task_id,)).fetchall()
        return [decode_proposal(row, include_team=True) for row in rows]

    def decide_proposal(self, proposal_id: str, status: str) -> dict | None:
        with self._connection() as db:
            db.execute("UPDATE marketplace_proposals SET status = ? WHERE id = ?", (status, proposal_id))
            row = db.execute("SELECT * FROM marketplace_proposals WHERE id = ?", (proposal_id,)).fetchone()
        return decode_proposal(row) if row else None

    def create_milestone(self, values: dict) -> dict:
        milestone = {"id": str(uuid4()), **values, "confirmedAt": None, "pointsAwarded": 0, "createdAt": utc_now()}
        with self._connection() as db:
            db.execute("INSERT INTO marketplace_milestones VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (
                milestone["id"], milestone["taskId"], milestone["teamId"], milestone["description"], milestone["evidence"],
                None, 0, milestone["createdAt"],
            ))
        return milestone

    def list_milestones(self, task_id: str) -> list[dict]:
        with self._connection() as db:
            rows = db.execute("""SELECT m.*, t.name AS team_name FROM marketplace_milestones m
                JOIN marketplace_teams t ON t.id = m.team_id
                WHERE m.task_id = ? ORDER BY m.created_at DESC, m.id""", (task_id,)).fetchall()
        return [decode_milestone(row, include_team=True) for row in rows]

    def confirm_milestone(self, milestone_id: str) -> tuple[str, dict | None]:
        with self._connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM marketplace_milestones WHERE id = ?", (milestone_id,)).fetchone()
            if row is None:
                return "missing", None
            milestone = decode_milestone(row)
            if milestone["confirmedAt"]:
                return "already_confirmed", milestone
            selected = db.execute("SELECT 1 FROM marketplace_proposals WHERE task_id = ? AND team_id = ? AND status = 'selected'", (milestone["taskId"], milestone["teamId"])).fetchone()
            if selected is None:
                return "not_selected", milestone
            confirmed_at = utc_now()
            db.execute("UPDATE marketplace_milestones SET confirmed_at = ?, points_awarded = 10 WHERE id = ?", (confirmed_at, milestone_id))
            db.execute("UPDATE marketplace_teams SET progress_points = progress_points + 10 WHERE id = ?", (milestone["teamId"],))
            row = db.execute("SELECT * FROM marketplace_milestones WHERE id = ?", (milestone_id,)).fetchone()
        return "confirmed", decode_milestone(row)


def decode_team(row):
    return {"id": row["id"], "name": row["name"], "interests": json.loads(row["interests_json"]),
            "skills": json.loads(row["skills_json"]), "technologies": json.loads(row["technologies_json"]),
            "progressPoints": row["progress_points"], "createdAt": row["created_at"]}


def decode_proposal(row, include_team=False):
    result = {"id": row["id"], "taskId": row["task_id"], "teamId": row["team_id"], "idea": row["idea"],
              "plan": row["plan"], "deadline": row["deadline"], "prototypeUrl": row["prototype_url"],
              "status": row["status"], "createdAt": row["created_at"]}
    if include_team:
        result["team"] = {"id": row["team_id"], "name": row["team_name"], "interests": json.loads(row["interests_json"]), "skills": json.loads(row["skills_json"]), "technologies": json.loads(row["technologies_json"]), "progressPoints": row["progress_points"]}
    return result


def decode_milestone(row, include_team=False):
    result = {"id": row["id"], "taskId": row["task_id"], "teamId": row["team_id"], "description": row["description"],
              "evidence": row["evidence"], "confirmedAt": row["confirmed_at"], "pointsAwarded": row["points_awarded"], "createdAt": row["created_at"]}
    if include_team:
        result["team"] = {"id": row["team_id"], "name": row["team_name"]}
    return result


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()
