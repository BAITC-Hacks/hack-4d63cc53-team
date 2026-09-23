from __future__ import annotations

import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlencode, urlsplit

from fastapi import FastAPI

from backend.db import TaskRepository
from backend.marketplace.repository import MarketplaceRepository
from backend.marketplace.router import router
from backend.tasks import TaskService
from data.seed_demo import load_demo


class ASGIClient:
    """Exercise the HTTP ASGI boundary without an optional httpx dependency."""

    def __init__(self, app):
        self.app = app

    def request(self, method, url, body=None, params=None):
        parsed = urlsplit(url)
        query = urlencode(params) if params else parsed.query
        raw = json.dumps(body).encode() if body is not None else b""
        scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
                 "method": method, "scheme": "http", "path": parsed.path,
                 "raw_path": parsed.path.encode(), "query_string": query.encode(),
                 "headers": [(b"content-type", b"application/json")],
                 "client": ("127.0.0.1", 1), "server": ("test", 80)}
        sent = []

        async def receive():
            return {"type": "http.request", "body": raw, "more_body": False}

        async def send(message):
            sent.append(message)

        asyncio.run(self.app(scope, receive, send))
        code = next(item["status"] for item in sent if item["type"] == "http.response.start")
        payload = b"".join(item.get("body", b"") for item in sent if item["type"] == "http.response.body")
        return SimpleNamespace(status_code=code, text=payload.decode(), json=lambda: json.loads(payload))

    def get(self, path, params=None):
        return self.request("GET", path, params=params)

    def post(self, path, json=None):
        return self.request("POST", path, body=json)

    def patch(self, path, json=None):
        return self.request("PATCH", path, body=json)

    def close(self):
        pass


class MarketplaceHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "demo.sqlite3"
        self.seed = load_demo(self.path)
        self.open_client()

    def open_client(self):
        app = FastAPI()
        app.state.task_repository = TaskRepository(self.path)
        app.state.marketplace_repository = MarketplaceRepository(self.path)
        app.include_router(router)
        self.tasks = TaskService(app.state.task_repository)
        self.client = ASGIClient(app)

    def tearDown(self):
        self.client.close()
        self.temp.cleanup()

    def proposal(self, task_id, team_id):
        response = self.client.post("/api/proposals", json={
            "taskId": task_id, "teamId": team_id, "idea": "Понятная идея решения",
            "plan": "Исследование, прототип, проверка", "deadline": "2 недели",
            "prototypeUrl": "https://example.com/demo",
        })
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_seed_catalog_filters_and_published_snapshot(self):
        catalog = self.client.get("/api/catalog").json()
        self.assertEqual([item["score"] for item in catalog], [100, 90, 70, 40, 0])
        self.assertEqual({item["readiness"] for item in catalog}, {"draft", "working", "ready", "priority"})
        for level in ("draft", "working", "ready", "priority"):
            filtered = self.client.get("/api/catalog", params={"readiness": level}).json()
            self.assertTrue(filtered)
            self.assertTrue(all(item["readiness"] == level for item in filtered))
        for item in catalog:
            filtered = self.client.get("/api/catalog", params={"topic": item["fields"]["topic"], "readiness": item["readiness"]}).json()
            self.assertIn(item["taskId"], [entry["taskId"] for entry in filtered])
        published = catalog[0]
        draft = self.tasks.get(published["taskId"])
        self.tasks.patch(draft["id"], draft["revision"], {"title": "СЕКРЕТНЫЙ ЧЕРНОВИК", "topic": "НЕ ПУБЛИКОВАТЬ"})
        self.tasks.create("Новая непубличная задача", {"title": "Не опубликована"})
        self.assertEqual(self.client.get("/api/catalog").json(), catalog)
        self.assertEqual(self.client.get("/api/catalog?readiness=unknown").status_code, 422)

    def test_seed_is_a_complete_linked_demo_scenario(self):
        self.assertEqual({key: len(self.seed[key]) for key in ("tasks", "teams", "proposals")}, {
            "tasks": 5, "teams": 5, "proposals": 5,
        })
        self.assertEqual(sorted(task["score"] for task in self.seed["tasks"]), [0, 40, 70, 90, 100])

        task_ids = {task["id"] for task in self.seed["tasks"]}
        team_ids = {team["id"] for team in self.seed["teams"]}
        proposals = [
            proposal
            for task_id in task_ids
            for proposal in self.client.get(f"/api/tasks/{task_id}/proposals").json()
        ]
        self.assertEqual(len(proposals), 5)
        self.assertTrue(all(proposal["taskId"] in task_ids and proposal["teamId"] in team_ids for proposal in proposals))
        self.assertTrue(all(proposal["deadline"].strip() and proposal["prototypeUrl"].startswith("https://") for proposal in proposals))

    def test_low_score_multiple_decisions_points_and_reopen(self):
        task = min(self.seed["tasks"], key=lambda item: item["score"])
        team_ids = [team["id"] for team in self.seed["teams"][:3]]
        proposals = [self.proposal(task["id"], team_id) for team_id in team_ids]
        self.assertTrue(all(item["status"] == "pending" for item in proposals))
        self.assertTrue(all(team["progressPoints"] == 0 for team in self.client.get("/api/teams").json()))
        milestone = self.client.post("/api/milestones", json={"taskId": task["id"], "teamId": team_ids[0], "description": "Проверенный прототип", "evidence": "Проведено пять интервью"}).json()
        endpoint = f'/api/milestones/{milestone["id"]}/confirm'
        self.assertEqual(self.client.post(endpoint).status_code, 409)
        for proposal, decision in zip(proposals, ["selected", "selected", "rejected"]):
            response = self.client.patch(f'/api/proposals/{proposal["id"]}', json={"status": decision})
            self.assertEqual(response.json()["status"], decision)
        self.assertTrue(self.client.post(endpoint).json()["awarded"])
        self.assertFalse(self.client.post(endpoint).json()["awarded"])
        second = self.client.post("/api/milestones", json={"taskId": task["id"], "teamId": team_ids[0], "description": "Второй результат", "evidence": "Новые интервью"}).json()
        self.assertTrue(self.client.post(f'/api/milestones/{second["id"]}/confirm').json()["awarded"])
        self.client.close()
        self.open_client()
        saved = self.client.get(f'/api/tasks/{task["id"]}/milestones').json()
        self.assertEqual(len(saved), 2)
        self.assertTrue(all(item["confirmedAt"] and item["pointsAwarded"] == 10 for item in saved))
        teams = {item["id"]: item for item in self.client.get("/api/teams").json()}
        self.assertEqual(teams[team_ids[0]]["progressPoints"], 20)
        self.assertEqual(teams[team_ids[1]]["progressPoints"], 0)
        saved_proposals = {item["id"]: item for item in self.client.get(f'/api/tasks/{task["id"]}/proposals').json()}
        self.assertEqual([saved_proposals[item["id"]]["status"] for item in proposals], ["selected", "selected", "rejected"])
        self.assertEqual(next(item for item in self.client.get("/api/catalog").json() if item["taskId"] == task["id"])["score"], 0)

    def test_validation_and_missing_resources(self):
        team = {"name": " x ", "skills": ["Python"], "interests": ["UX"]}
        self.assertEqual(self.client.post("/api/teams", json=team).status_code, 422)
        for invalid in [None, 12, "   "]:
            self.assertEqual(self.client.post("/api/teams", json={**team, "name": invalid}).status_code, 422)
        valid = {"taskId": self.seed["tasks"][0]["id"], "teamId": self.seed["teams"][0]["id"], "idea": "Хорошая длинная идея", "plan": "Достаточно подробный план", "deadline": "2 недели"}
        for field, value in [("idea", " a         "), ("plan", "          "), ("deadline", " x "), ("prototypeUrl", "javascript:alert(1)"), ("idea", 42)]:
            with self.subTest(field=field, value=value):
                self.assertEqual(self.client.post("/api/proposals", json={**valid, field: value}).status_code, 422)
        self.assertEqual(self.client.post("/api/proposals", json={**valid, "taskId": "missing"}).status_code, 404)
        self.assertEqual(self.client.post("/api/proposals", json={**valid, "teamId": "missing"}).status_code, 404)
        draft = self.tasks.create("Не опубликована", {})
        self.assertEqual(self.client.post("/api/proposals", json={**valid, "taskId": draft["id"]}).status_code, 404)
        for suffix in ["proposals", "milestones"]:
            self.assertEqual(self.client.get(f"/api/tasks/missing/{suffix}").status_code, 404)
        self.assertEqual(self.client.patch("/api/proposals/missing", json={"status": "selected"}).status_code, 404)
        self.assertEqual(self.client.post("/api/milestones/missing/confirm").status_code, 404)
        self.assertEqual(self.client.post("/api/milestones", json={"taskId": valid["taskId"], "teamId": valid["teamId"], "description": " x    ", "evidence": "   "}).status_code, 422)


if __name__ == "__main__":
    unittest.main()
