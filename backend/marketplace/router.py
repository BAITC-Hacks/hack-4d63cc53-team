from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from .repository import MarketplaceRepository
from .schemas import MilestoneCreate, ProposalCreate, ProposalDecision, TeamCreate

router = APIRouter(prefix="/api", tags=["marketplace"])


def repository(request: Request) -> MarketplaceRepository:
    value = getattr(request.app.state, "marketplace_repository", None)
    if value is None:
        value = MarketplaceRepository(request.app.state.task_repository.path)
        request.app.state.marketplace_repository = value
    return value


def published(request: Request, task_id: str | None = None):
    snapshots = request.app.state.task_repository.list_published_tasks()
    if task_id is None:
        return snapshots
    return next((item for item in snapshots if item["taskId"] == task_id), None)


@router.get("/catalog")
def catalog(request: Request, topic: str | None = None, readiness: str | None = None):
    if readiness is not None and readiness not in {"draft", "working", "ready", "priority"}:
        raise HTTPException(422, "Unknown readiness")
    items = published(request)
    if topic:
        needle = topic.casefold().strip()
        items = [item for item in items if needle in item["fields"].get("topic", "").casefold()]
    if readiness:
        items = [item for item in items if item.get("readiness") == readiness]
    return sorted(items, key=lambda item: (-item.get("score", 0), item["taskId"]))


@router.get("/teams")
def list_teams(request: Request):
    return repository(request).list_teams()


@router.post("/teams", status_code=201)
def create_team(request: Request, body: TeamCreate):
    return repository(request).create_team(body.model_dump())


@router.post("/proposals", status_code=201)
def create_proposal(request: Request, body: ProposalCreate):
    values = body.model_dump(mode="json")
    if not published(request, values["taskId"]):
        raise HTTPException(404, "Published task not found")
    if not repository(request).get_team(values["teamId"]):
        raise HTTPException(404, "Team not found")
    return repository(request).create_proposal(values)


@router.get("/tasks/{task_id}/proposals")
def task_proposals(request: Request, task_id: str):
    if not published(request, task_id):
        raise HTTPException(404, "Published task not found")
    return repository(request).list_proposals(task_id)


@router.patch("/proposals/{proposal_id}")
def decide_proposal(request: Request, proposal_id: str, body: ProposalDecision):
    proposal = repository(request).decide_proposal(proposal_id, body.status)
    if proposal is None:
        raise HTTPException(404, "Proposal not found")
    return proposal


@router.post("/milestones", status_code=201)
def create_milestone(request: Request, body: MilestoneCreate):
    values = body.model_dump()
    if not published(request, values["taskId"]):
        raise HTTPException(404, "Published task not found")
    if not repository(request).get_team(values["teamId"]):
        raise HTTPException(404, "Team not found")
    return repository(request).create_milestone(values)


@router.get("/tasks/{task_id}/milestones")
def task_milestones(request: Request, task_id: str):
    if not published(request, task_id):
        raise HTTPException(404, "Published task not found")
    return repository(request).list_milestones(task_id)


@router.post("/milestones/{milestone_id}/confirm")
def confirm_milestone(request: Request, milestone_id: str):
    status, milestone = repository(request).confirm_milestone(milestone_id)
    if status == "missing":
        raise HTTPException(404, "Milestone not found")
    if status == "not_selected":
        raise HTTPException(409, "Only a selected team can receive milestone points")
    return {"milestone": milestone, "awarded": status == "confirmed"}
