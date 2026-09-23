"""Load synthetic demo data through the public task service and marketplace repository.

Run from the repository root: ``python data/seed_demo.py``.
The script intentionally creates fresh IDs, then connects proposals to those IDs.
"""
from __future__ import annotations

import json
from pathlib import Path

from backend.config import DATABASE_PATH
from backend.db import TaskRepository
from backend.marketplace.repository import MarketplaceRepository
from backend.tasks import TaskService


def main():
    data = json.loads((Path(__file__).with_name("marketplace-seed.json")).read_text(encoding="utf-8"))
    task_service = TaskService(TaskRepository(DATABASE_PATH))
    marketplace = MarketplaceRepository(DATABASE_PATH)
    task_ids, team_ids = {}, {}
    for item in data["tasks"]:
        task = task_service.create(item["rawDescription"], item["fields"])
        status, task = task_service.confirm(task["id"], task["revision"], item["confirmFields"])
        assert status == "ok"
        status, task = task_service.publish(task["id"], task["revision"])
        assert status == "ok"
        task_ids[item["key"]] = task["id"]
    for item in data["teams"]:
        team = marketplace.create_team({key: item[key] for key in ("name", "interests", "skills", "technologies")})
        team_ids[item["key"]] = team["id"]
    for item in data["proposals"]:
        values = {key: item[key] for key in ("idea", "plan", "deadline", "prototypeUrl")}
        proposal = marketplace.create_proposal({**values, "taskId": task_ids[item["taskKey"]], "teamId": team_ids[item["teamKey"]]})
        if item["status"] != "pending":
            marketplace.decide_proposal(proposal["id"], item["status"])
    print("Demo seed loaded.")


if __name__ == "__main__":
    main()
