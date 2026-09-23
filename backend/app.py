from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .ai import analyze
from .config import CORS_ORIGINS, DATABASE_PATH
from .db import TaskRepository
from .schemas import AnalyzeRequest, ConfirmTaskRequest, CreateTaskRequest, PatchTaskRequest, PublishTaskRequest
from .tasks import TaskService

def create_app(database_path: Path | None = None, service: TaskService | None = None) -> FastAPI:
    task_service = service or TaskService(TaskRepository(database_path or DATABASE_PATH))
    application = FastAPI(title="HackAlem Task API")
    application.state.task_repository = task_service.repository
    application.state.task_service = task_service
    application.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.get("/api/health")
    def health():
        return {"status": "ok"}

    @application.get("/api/tasks")
    def list_tasks():
        return task_service.list()

    @application.post("/api/tasks", status_code=201)
    def create_task(body: CreateTaskRequest):
        return task_service.create(body.rawDescription, body.fields)

    @application.get("/api/tasks/{task_id}")
    def get_task(task_id: str):
        return require_task(task_service.get(task_id))

    @application.patch("/api/tasks/{task_id}")
    def patch_task(task_id: str, body: PatchTaskRequest):
        return mutation(*task_service.patch(task_id, body.expectedRevision, body.fields))

    @application.post("/api/tasks/{task_id}/confirm")
    def confirm_task(task_id: str, body: ConfirmTaskRequest):
        return mutation(*task_service.confirm(task_id, body.expectedRevision, body.fields))

    @application.post("/api/tasks/{task_id}/publish")
    def publish_task(task_id: str, body: PublishTaskRequest):
        return mutation(*task_service.publish(task_id, body.expectedRevision))

    @application.post("/api/analyze")
    def analyze_task(body: AnalyzeRequest):
        return analyze(body.description, body.answers)

    return application

def require_task(task):
    if task is None:
        raise HTTPException(404, "Task not found")
    return task

def mutation(status, task):
    if status == "missing":
        raise HTTPException(404, "Task not found")
    if status == "stale":
        raise HTTPException(409, {"message": "Stale revision", "task": task})
    return task

app = create_app()