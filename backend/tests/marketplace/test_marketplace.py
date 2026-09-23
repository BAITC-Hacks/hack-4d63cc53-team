from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException

from backend.db import TaskRepository
from backend.marketplace.repository import MarketplaceRepository
from backend.marketplace.router import catalog
from backend.tasks import TaskService


class MarketplaceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="hackalem-marketplace-")
        path = Path(self.temp.name) / "app.sqlite3"
        self.tasks = TaskService(TaskRepository(path))
        self.marketplace = MarketplaceRepository(path)
        self.request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(
            task_repository=self.tasks.repository, marketplace_repository=self.marketplace
        )))
        self.task_id = self.publish("кафе", "working", 40)
        self.high_task_id = self.publish("магазин", "priority", 100)
        self.equal_score_task_id = self.publish("склад", "working", 40)
        self.team = self.marketplace.create_team({"name": "Команда", "interests": ["данные"], "skills": ["Python"], "technologies": []})

    def tearDown(self):
        self.temp.cleanup()

    def publish(self, topic, readiness, target_score):
        fields = {"topic": topic, "title": topic, "context": "Контекст", "need": "Потребность", "data": "Данные", "expectedResult": "Результат", "successCriteria": "Критерий", "constraints": "Ограничение", "users": "Пользователи", "contact": "Контакт", "interactionFormat": "Созвон", "feedbackProcess": "Приемка"}
        task = self.tasks.create(topic, fields)
        groups = {40: ["topic", "title", "context", "need", "data"], 100: list(fields)}
        _, task = self.tasks.confirm(task["id"], task["revision"], groups[target_score])
        _, task = self.tasks.publish(task["id"], task["revision"])
        self.assertEqual(task["score"], target_score)
        return task["id"]

    def test_catalog_filters_and_orders_published_snapshots(self):
        self.assertEqual(
            [item["taskId"] for item in catalog(self.request)],
            [self.high_task_id, *sorted([self.task_id, self.equal_score_task_id])],
        )
        self.assertEqual([item["taskId"] for item in catalog(self.request, topic="каф")], [self.task_id])
        self.assertEqual([item["taskId"] for item in catalog(self.request, readiness="priority")], [self.high_task_id])
        with self.assertRaises(HTTPException):
            catalog(self.request, readiness="unknown")

    def test_proposals_are_manual_and_milestone_is_awarded_once(self):
        proposal = self.marketplace.create_proposal({"taskId": self.task_id, "teamId": self.team["id"], "idea": "Понятная идея", "plan": "Реальный план", "deadline": "2 недели", "prototypeUrl": None})
        self.assertEqual(proposal["status"], "pending")
        milestone = self.marketplace.create_milestone({"taskId": self.task_id, "teamId": self.team["id"], "description": "Показали прототип", "evidence": "https://example.com/demo"})
        self.assertEqual(self.marketplace.confirm_milestone(milestone["id"])[0], "not_selected")
        self.marketplace.decide_proposal(proposal["id"], "selected")
        status, confirmed = self.marketplace.confirm_milestone(milestone["id"])
        self.assertEqual((status, confirmed["pointsAwarded"]), ("confirmed", 10))
        self.assertEqual(self.marketplace.get_team(self.team["id"])["progressPoints"], 10)
        status, repeated = self.marketplace.confirm_milestone(milestone["id"])
        self.assertEqual((status, repeated["pointsAwarded"]), ("already_confirmed", 10))
        self.assertEqual(self.marketplace.get_team(self.team["id"])["progressPoints"], 10)


if __name__ == "__main__":
    unittest.main()
