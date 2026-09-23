from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TeamCreate(StrictModel):
    name: str = Field(min_length=2, max_length=120)
    interests: list[str] = Field(min_length=1, max_length=12)
    skills: list[str] = Field(min_length=1, max_length=20)
    technologies: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("name", mode="before")
    @classmethod
    def nonblank_name(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value

    @field_validator("interests", "skills", "technologies")
    @classmethod
    def nonblank_tags(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values]
        if any(not value for value in cleaned):
            raise ValueError("tags cannot be blank")
        return cleaned


class ProposalCreate(StrictModel):
    taskId: str = Field(min_length=1, max_length=100)
    teamId: str = Field(min_length=1, max_length=100)
    idea: str = Field(min_length=10, max_length=4000)
    plan: str = Field(min_length=10, max_length=4000)
    deadline: str = Field(min_length=2, max_length=100)
    prototypeUrl: HttpUrl | None = None

    @field_validator("taskId", "teamId", "idea", "plan", "deadline", mode="before")
    @classmethod
    def nonblank_text(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value


class ProposalDecision(StrictModel):
    status: Literal["selected", "rejected"]


class MilestoneCreate(StrictModel):
    taskId: str = Field(min_length=1, max_length=100)
    teamId: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=5, max_length=4000)
    evidence: str = Field(min_length=3, max_length=2000)

    @field_validator("taskId", "teamId", "description", "evidence", mode="before")
    @classmethod
    def nonblank_text(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value
