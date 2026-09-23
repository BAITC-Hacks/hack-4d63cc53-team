from __future__ import annotations

import asyncio
import json
import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

# Isolate app.py's module-level app import from the developer's environment.
_IMPORT_DB_DIR = tempfile.TemporaryDirectory(prefix="hackalem-core-import-")
_IMPORT_DB_PATH = str(Path(_IMPORT_DB_DIR.name) / "import.sqlite3")
with patch.dict(os.environ, {"DATABASE_PATH": _IMPORT_DB_PATH, "OPENAI_API_KEY": ""}), patch("dotenv.load_dotenv"):
    from backend import ai  # noqa: E402
    from backend.app import create_app  # noqa: E402
    from backend.schemas import EDITABLE_FIELDS  # noqa: E402
    from backend.scoring import calculate_score, readiness_for  # noqa: E402


def tearDownModule():
    _IMPORT_DB_DIR.cleanup()


def asgi_request(app, method="GET", path="/", body=None, headers=None):
    raw = json.dumps(body).encode() if body is not None else b""
    request_headers = [(b"content-type", b"application/json")]
    request_headers.extend(headers or [])
    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
        "method": method, "scheme": "http", "path": path, "raw_path": path.encode(),
        "query_string": b"", "headers": request_headers, "client": ("127.0.0.1", 1),
        "server": ("test", 80),
    }
    messages = [{"type": "http.request", "body": raw, "more_body": False}]
    sent = []

    async def receive():
        return messages.pop(0) if messages else {"type": "http.disconnect"}

    async def send(message):
        sent.append(message)

    asyncio.run(app(scope, receive, send))
    start = next(item for item in sent if item["type"] == "http.response.start")
    payload = b"".join(item.get("body", b"") for item in sent if item["type"] == "http.response.body")
    response_headers = dict(start.get("headers", []))
    decoded = json.loads(payload) if payload and response_headers.get(b"content-type", b"").startswith(b"application/json") else payload.decode("utf-8") if payload else None
    return start["status"], response_headers, decoded


class CoreTestCase(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="hackalem-core-")
        self.db = Path(self.temp.name) / "tasks.sqlite3"
        self.app = create_app(self.db)

    def tearDown(self):
        self.temp.cleanup()

    def request(self, *args, **kwargs):
        return asgi_request(self.app, *args, **kwargs)


class ScoringTests(unittest.TestCase):
    def test_empty_and_fully_confirmed_scores_and_breakdown(self):
        empty = calculate_score({}, set())
        self.assertEqual(empty["score"], 0)
        full_fields = {name: " value " for name in EDITABLE_FIELDS}
        full = calculate_score(full_fields, set(EDITABLE_FIELDS))
        self.assertEqual(full["score"], 100)
        self.assertEqual(sum(group["points"] for group in full["scoreBreakdown"]), full["score"])
        self.assertEqual(sum(group["maxPoints"] for group in full["scoreBreakdown"]), 100)

    def test_each_group_requires_every_nonblank_field_and_confirmation(self):
        fields = {name: "filled" for name in EDITABLE_FIELDS}
        confirmed = set(EDITABLE_FIELDS)
        score = calculate_score(fields, confirmed)["score"]
        for name in ("context", "need", "data", "expectedResult", "successCriteria", "constraints", "users", "contact", "interactionFormat", "feedbackProcess"):
            with self.subTest(field=name):
                changed = dict(fields)
                changed[name] = " \t "
                self.assertLess(calculate_score(changed, confirmed)["score"], score)
                self.assertLess(calculate_score(fields, confirmed - {name})["score"], score)
        context_only = calculate_score(fields, confirmed - {"need"})["score"]
        self.assertEqual(context_only, 80)

    def test_readiness_boundaries(self):
        expected = {0: "draft", 39: "draft", 40: "working", 69: "working", 70: "ready", 89: "ready", 90: "priority", 100: "priority"}
        for score, readiness in expected.items():
            with self.subTest(score=score):
                self.assertEqual(readiness_for(score), readiness)


class TaskApiTests(CoreTestCase):
    def test_create_list_get_patch_confirmation_and_selective_invalidation(self):
        status, _, task = self.request("POST", "/api/tasks", {"rawDescription": "Initial", "fields": {"topic": "Topic", "context": "Context", "need": "Need"}})
        self.assertEqual(status, 201)
        task_id = task["id"]
        self.assertEqual(task["revision"], 1)
        self.assertEqual(task["score"], 0, "unconfirmed draft fields must not count")
        status, _, listed = self.request("GET", "/api/tasks")
        self.assertEqual(status, 200)
        self.assertEqual([item["id"] for item in listed], [task_id])
        self.assertEqual(self.request("GET", f"/api/tasks/{task_id}")[2]["rawDescription"], "Initial")

        status, _, task = self.request("POST", f"/api/tasks/{task_id}/confirm", {"expectedRevision": 1, "fields": ["context", "need"]})
        self.assertEqual(status, 200)
        self.assertEqual(task["revision"], 2)
        self.assertEqual(set(task["confirmedFields"]), {"context", "need"})
        status, _, task = self.request("PATCH", f"/api/tasks/{task_id}", {"expectedRevision": 2, "fields": {"need": "Updated need", "title": "New title"}})
        self.assertEqual(status, 200)
        self.assertEqual(task["revision"], 3)
        self.assertNotIn("need", task["confirmedFields"])
        self.assertIn("context", task["confirmedFields"])
        self.assertEqual(task["score"], 0)
        self.assertEqual(self.request("POST", "/api/tasks/missing/confirm", {"expectedRevision": 1, "fields": ["need"]})[0], 404)

    def test_publish_snapshot_hides_unconfirmed_text_and_survives_draft_edit(self):
        _, _, task = self.request("POST", "/api/tasks", {"rawDescription": "Draft", "fields": {"context": "public context", "need": "secret unconfirmed", "topic": "secret topic"}})
        task_id = task["id"]
        _, _, task = self.request("POST", f"/api/tasks/{task_id}/confirm", {"expectedRevision": 1, "fields": ["context"]})
        _, _, task = self.request("POST", f"/api/tasks/{task_id}/publish", {"expectedRevision": 2})
        snapshot = task["publishedVersion"]
        self.assertEqual(snapshot["version"], 3)
        self.assertEqual(snapshot["score"], 0, "low score must not block publication")
        self.assertEqual(snapshot["fields"]["context"], "public context")
        self.assertEqual(snapshot["fields"]["need"], "")
        self.assertEqual(snapshot["fields"]["topic"], "")
        self.assertNotIn("secret", json.dumps(snapshot))

        _, _, edited = self.request("PATCH", f"/api/tasks/{task_id}", {"expectedRevision": 3, "fields": {"context": "new draft context", "need": "new draft need"}})
        self.assertEqual(edited["revision"], 4)
        self.assertEqual(edited["publicationStatus"], "published")
        self.assertEqual(edited["publishedVersion"], snapshot)
        _, _, republished = self.request("POST", f"/api/tasks/{task_id}/publish", {"expectedRevision": 4})
        self.assertEqual(republished["publishedVersion"]["version"], 5)
        self.assertEqual(republished["publishedVersion"]["fields"]["context"], "")

    def test_stale_mutation_is_atomic_and_unknown_task_is_404(self):
        _, _, task = self.request("POST", "/api/tasks", {"rawDescription": "Before"})
        task_id = task["id"]
        self.request("PATCH", f"/api/tasks/{task_id}", {"expectedRevision": 1, "fields": {"title": "Applied"}})
        status, _, conflict = self.request("PATCH", f"/api/tasks/{task_id}", {"expectedRevision": 1, "fields": {"title": "Must not apply"}})
        self.assertEqual(status, 409)
        self.assertEqual(conflict["detail"]["task"]["revision"], 2)
        self.assertEqual(self.request("GET", f"/api/tasks/{task_id}")[2]["title"], "Applied")
        self.assertEqual(self.request("GET", "/api/tasks/not-a-task")[0], 404)
        self.assertEqual(self.request("PATCH", "/api/tasks/not-a-task", {"expectedRevision": 1, "fields": {"title": "x"}})[0], 404)

    def test_persistence_and_utc_timestamp_shape(self):
        _, _, created = self.request("POST", "/api/tasks", {"rawDescription": "Persist me"})
        created_time = datetime.fromisoformat(created["createdAt"])
        self.assertIsNotNone(created_time.tzinfo)
        status, _, patched = self.request("PATCH", f"/api/tasks/{created['id']}", {"expectedRevision": 1, "fields": {"title": "Saved"}})
        self.assertEqual(status, 200)
        self.assertGreaterEqual(datetime.fromisoformat(patched["updatedAt"]), created_time)
        reopened = create_app(self.db)
        status, _, loaded = asgi_request(reopened, "GET", f"/api/tasks/{created['id']}")
        self.assertEqual(status, 200)
        self.assertEqual((loaded["title"], loaded["revision"]), ("Saved", 2))
        self.assertEqual(loaded["createdAt"], created["createdAt"])

    def test_api_docs_health_and_cors(self):
        self.assertEqual(self.request("GET", "/api/health")[2], {"status": "ok"})
        status, _, docs = self.request("GET", "/openapi.json")
        self.assertEqual(status, 200)
        self.assertIn("/api/tasks/{task_id}", docs["paths"])
        self.assertEqual(self.request("GET", "/docs")[0], 200)
        allowed = self.request("OPTIONS", "/api/tasks", headers=[(b"origin", b"http://localhost:5173"), (b"access-control-request-method", b"POST")])
        self.assertEqual(allowed[0], 200)
        self.assertEqual(allowed[1].get(b"access-control-allow-origin"), b"http://localhost:5173")
        denied = self.request("OPTIONS", "/api/tasks", headers=[(b"origin", b"https://untrusted.invalid"), (b"access-control-request-method", b"POST")])
        self.assertNotIn(b"access-control-allow-origin", denied[1])

    def test_invalid_request_shapes_return_422(self):
        bad_creates = [
            {"rawDescription": "x", "extra": True},
            {"rawDescription": "x", "fields": {"unknown": "x"}},
            {"rawDescription": "x", "fields": {"title": 4}},
            {"rawDescription": "x", "fields": {"title": "x" * 4001}},
            {"rawDescription": "x" * 10001},
        ]
        for body in bad_creates:
            with self.subTest(body=str(body)[:30]):
                self.assertEqual(self.request("POST", "/api/tasks", body)[0], 422)
        _, _, task = self.request("POST", "/api/tasks", {"rawDescription": "x"})
        task_path = f"/api/tasks/{task['id']}"
        bad_mutations = [
            ("PATCH", task_path, {"expectedRevision": True, "fields": {"title": "x"}}),
            ("PATCH", task_path, {"expectedRevision": "1", "fields": {"title": "x"}}),
            ("PATCH", task_path, {"expectedRevision": 1, "fields": {"title": "x", "extra": "y"}}),
            ("PATCH", task_path, {"expectedRevision": 1, "fields": {}}),
            ("POST", f"{task_path}/confirm", {"expectedRevision": 1, "fields": ["need", "need"]}),
            ("POST", f"{task_path}/confirm", {"expectedRevision": 1, "fields": ["unknown"]}),
            ("POST", f"{task_path}/publish", {"expectedRevision": False}),
        ]
        for method, path, body in bad_mutations:
            with self.subTest(body=body):
                self.assertEqual(self.request(method, path, body)[0], 422)


class AnalyzeTests(CoreTestCase):
    def valid_ai_response(self, fields=None, questions=None, missing=None):
        values = {name: "" for name in EDITABLE_FIELDS}
        values.update(fields or {})
        result = {"fields": values, "questions": questions or ["Какой результат нужен?", "Кто подтвердит?", "Какие данные доступны?"], "missingFields": missing or ["need"]}
        return {"status": "completed", "output": [{"type": "message", "content": [{"type": "output_text", "text": json.dumps(result, ensure_ascii=False)}]}]}

    def test_valid_completed_ai_response_and_strict_private_payload(self):
        response = self.valid_ai_response({"title": "Reviewed"})
        with patch.object(ai, "OPENAI_API_KEY", None):
            _, _, result = self.request("POST", "/api/analyze", {"description": "Describe", "answers": {"need": "Existing answer"}})
        self.assertEqual(result["mode"], "fallback", "the HTTP route must use offline fallback when no key is configured")

        captured = []
        def transport(payload):
            captured.append(payload)
            return response
        with patch.object(ai, "OPENAI_API_KEY", "dummy-test-key"), patch.object(ai, "OPENAI_MODEL", "test-model"):
            result = ai.analyze("Describe", {"need": "Existing answer"}, transport=transport)
        self.assertEqual(result["mode"], "openai")
        self.assertEqual(result["fields"]["title"], "Reviewed")
        self.assertEqual(len(captured), 1)
        payload = captured[0]
        self.assertEqual(payload["model"], "test-model")
        self.assertIs(payload["store"], False)
        self.assertEqual(payload["text"]["format"]["type"], "json_schema")
        self.assertIs(payload["text"]["format"]["strict"], True)
        self.assertIs(payload["text"]["format"]["schema"]["additionalProperties"], False)
        self.assertIn('"need": "Existing answer"', payload["input"])

    def test_no_key_fallback_preserves_answers_and_has_three_distinct_questions(self):
        answers = {"need": "Do not lose", "title": "Keep title"}
        with patch.object(ai, "OPENAI_API_KEY", None), patch.object(ai, "_post", side_effect=AssertionError("network must not be called")):
            result = ai.analyze("Original description", answers)
        self.assertEqual(result["mode"], "fallback")
        self.assertEqual(result["fields"]["need"], "Do not lose")
        self.assertEqual(result["fields"]["title"], "Keep title")
        self.assertEqual(result["fields"]["context"], "Original description")
        self.assertGreaterEqual(len(result["questions"]), 3)
        self.assertEqual(len({item.strip() for item in result["questions"]}), len(result["questions"]))
        self.assertTrue(all(len(item.strip()) > 12 for item in result["questions"]))

    def test_fully_populated_and_nearly_populated_fallback_still_asks_questions(self):
        full_answers = {name: f"value for {name}" for name in EDITABLE_FIELDS}
        near_answers = {name: "completed" for name in EDITABLE_FIELDS if name != "need"}
        for answers in (full_answers, near_answers):
            with self.subTest(missing=set(EDITABLE_FIELDS) - set(answers)), patch.object(ai, "OPENAI_API_KEY", None):
                result = ai.analyze("", answers)
                self.assertGreaterEqual(len(result["questions"]), 3)
                self.assertEqual(len({q.strip() for q in result["questions"]}), len(result["questions"]))

    def test_invalid_completed_outputs_all_use_safe_fallback(self):
        base = json.loads(self.valid_ai_response()["output"][0]["content"][0]["text"])
        invalid_data = []
        changed = dict(base); changed["extra"] = "secret"; invalid_data.append(changed)
        changed = dict(base); changed["questions"] = ["", "Q2", "Q3"]; invalid_data.append(changed)
        changed = dict(base); changed["questions"] = ["Same", " Same ", "Other"]; invalid_data.append(changed)
        changed = dict(base); changed["questions"] = ["Useful 1", None, "Useful 3"]; invalid_data.append(changed)
        changed = dict(base); changed["fields"] = dict(base["fields"]); changed["fields"].pop("title"); invalid_data.append(changed)
        changed = dict(base); changed["fields"] = dict(base["fields"]); changed["fields"]["unknown"] = "secret"; invalid_data.append(changed)
        changed = dict(base); changed["missingFields"] = ["unknown"]; invalid_data.append(changed)
        changed = dict(base); changed["missingFields"] = "need"; invalid_data.append(changed)
        invalid_responses = [
            {"status": "incomplete", "output": []},
            {"status": "completed", "output": [{"type": "message", "content": [{"type": "refusal", "refusal": "refused"}, {"type": "output_text", "text": json.dumps(base)}]}]},
            {"status": "completed", "output": [{"type": "message", "content": [{"type": "output_text", "text": "not-json"}]}]},
            {"status": "completed", "output": []},
            {"status": "completed", "output": [{"type": "message", "content": [{"type": "output_text", "text": json.dumps({"fields": {}, "questions": [], "missingFields": []})}]}]},
        ]
        invalid_responses.extend({"status": "completed", "output": [{"type": "message", "content": [{"type": "output_text", "text": json.dumps(item, ensure_ascii=False)}]}]} for item in invalid_data)
        for response in invalid_responses:
            with self.subTest(response=str(response)[:60]), patch.object(ai, "OPENAI_API_KEY", "dummy-test-key"):
                result = ai.analyze("Keep me", {"need": "Preserve me"}, transport=lambda _: response)
                self.assertEqual(result["mode"], "fallback")
                self.assertEqual(result["fields"]["context"], "Keep me")
                self.assertEqual(result["fields"]["need"], "Preserve me")
                self.assertNotIn("secret", json.dumps(result))

    def test_transport_errors_fallback_without_exposing_secret(self):
        for error in (OSError("token-secret network error"), TimeoutError("token-secret timeout")):
            with self.subTest(error=type(error).__name__), patch.object(ai, "OPENAI_API_KEY", "dummy-test-key"):
                result = ai.analyze("Context", {"need": "Answer"}, transport=lambda _: (_ for _ in ()).throw(error))
                self.assertEqual(result["mode"], "fallback")
                self.assertNotIn("token-secret", json.dumps(result))
                self.assertEqual(result["fields"]["need"], "Answer")

    def test_analyze_api_rejects_invalid_answer_fields(self):
        for answers in ({"unknown": "x"}, {"need": 4}, {"need": "x" * 4001}):
            with self.subTest(answers=str(answers)[:30]):
                self.assertEqual(self.request("POST", "/api/analyze", {"description": "x", "answers": answers})[0], 422)


if __name__ == "__main__":
    unittest.main()
