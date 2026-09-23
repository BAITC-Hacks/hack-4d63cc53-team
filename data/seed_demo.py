"""Load synthetic demo data through the public task service and marketplace repository.

Run from the repository root: ``python -m data.seed_demo``.
The script intentionally creates fresh IDs, then connects proposals to those IDs.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from backend.config import DATABASE_PATH
from backend.db import TaskRepository
from backend.marketplace.repository import MarketplaceRepository
from backend.marketplace.schemas import ProposalCreate, TeamCreate
from backend.tasks import TaskService


def load_demo(database_path: Path) -> dict:
    """Append a linked demo dataset, using the normal confirmation/scoring service."""
    data = json.loads((Path(__file__).with_name("marketplace-seed.json")).read_text(encoding="utf-8"))
    task_service = TaskService(TaskRepository(database_path))
    marketplace = MarketplaceRepository(database_path)
    task_ids, team_ids = {}, {}
    result = {"tasks": [], "teams": [], "proposals": []}
    for item in data["tasks"]:
        task = task_service.create(item["rawDescription"], item["fields"])
        status, task = task_service.confirm(task["id"], task["revision"], item["confirmFields"])
        assert status == "ok"
        status, task = task_service.publish(task["id"], task["revision"])
        assert status == "ok"
        task_ids[item["key"]] = task["id"]
        result["tasks"].append(task)
    for item in data["teams"]:
        values = TeamCreate(**{key: item[key] for key in ("name", "interests", "skills", "technologies")})
        team = marketplace.create_team(values.model_dump())
        team_ids[item["key"]] = team["id"]
        result["teams"].append(team)
    for item in data["proposals"]:
        values = {key: item[key] for key in ("idea", "plan", "deadline", "prototypeUrl")}
        validated = ProposalCreate(**values, taskId=task_ids[item["taskKey"]], teamId=team_ids[item["teamKey"]])
        proposal = marketplace.create_proposal(validated.model_dump(mode="json"))
        if item["status"] != "pending":
            proposal = marketplace.decide_proposal(proposal["id"], item["status"])
        result["proposals"].append(proposal)
    return result


def main():
    parser = argparse.ArgumentParser(description="Load synthetic marketplace data without calling AI.")
    parser.add_argument("--database", type=Path, help="Create a fresh demo database at an unused path.")
    args = parser.parse_args()
    if args.database is not None and args.database.exists():
        parser.error("--database must point to a new file; existing data will not be overwritten.")
    database_path = args.database if args.database is not None else DATABASE_PATH
    result = load_demo(database_path)
    print(f"Demo loaded: {len(result['tasks'])} tasks, {len(result['teams'])} teams, {len(result['proposals'])} proposals.")
    print("Computed scores:", ", ".join(str(task["score"]) for task in result["tasks"]))
    print(f"Database: {database_path.resolve()}")


if __name__ == "__main__":
    main()
