from __future__ import annotations

from copy import deepcopy

from .scoring import calculate_score

class TaskService:
    def __init__(self, repository):
        self.repository = repository

    def present(self, task: dict) -> dict:
        result = {key: deepcopy(value) for key, value in task.items() if key not in {"publication", "fields"}}
        result.update(deepcopy(task["fields"]))
        result.update(calculate_score(task["fields"], set(task["confirmedFields"])))
        result["publicationStatus"] = "published" if task["publication"] else "draft"
        result["publishedVersion"] = deepcopy(task["publication"])
        return result

    def create(self, raw_description, fields):
        return self.present(self.repository.create(raw_description, fields))

    def get(self, task_id):
        task = self.repository.get(task_id)
        return self.present(task) if task else None

    def list(self):
        return [self.present(task) for task in self.repository.list()]

    def patch(self, task_id, revision, updates):
        def apply(task):
            for field, value in updates.items():
                if task["fields"][field] != value:
                    task["fields"][field] = value
                    if field in task["confirmedFields"]:
                        task["confirmedFields"].remove(field)
        status, task = self.repository.mutate(task_id, revision, apply)
        return status, self.present(task) if task else None

    def confirm(self, task_id, revision, fields):
        def apply(task):
            confirmed = set(task["confirmedFields"])
            confirmed.update(fields)
            task["confirmedFields"] = sorted(confirmed)
        status, task = self.repository.mutate(task_id, revision, apply)
        return status, self.present(task) if task else None

    def publish(self, task_id, revision):
        def apply(task):
            metrics = calculate_score(task["fields"], set(task["confirmedFields"]))
            snapshot_fields = {
                name: task["fields"][name] if name in task["confirmedFields"] else ""
                for name in task["fields"]
            }
            task["publication"] = {
                "taskId": task["id"],
                "version": task["revision"] + 1,
                "publishedAt": task["updatedAt"],
                "fields": snapshot_fields,
                "confirmedFields": list(task["confirmedFields"]),
                **metrics,
            }
        status, task = self.repository.mutate(task_id, revision, apply)
        return status, self.present(task) if task else None