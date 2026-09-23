from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator

EDITABLE_FIELDS = (
    "topic", "title", "context", "need", "users", "data", "constraints",
    "expectedResult", "successCriteria", "contact", "interactionFormat", "feedbackProcess",
)
MAX_FIELD_LENGTH = 4000

class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

class CreateTaskRequest(StrictModel):
    rawDescription: str = Field(max_length=10000)
    fields: dict[str, str] = Field(default_factory=dict)

    @field_validator("fields")
    @classmethod
    def validate_fields(cls, fields: dict[str, str]) -> dict[str, str]:
        return validate_field_values(fields)

class PatchTaskRequest(StrictModel):
    expectedRevision: StrictInt = Field(ge=1)
    fields: dict[str, str]

    @field_validator("fields")
    @classmethod
    def validate_fields(cls, fields: dict[str, str]) -> dict[str, str]:
        if not fields:
            raise ValueError("fields cannot be empty")
        return validate_field_values(fields)

class ConfirmTaskRequest(StrictModel):
    expectedRevision: StrictInt = Field(ge=1)
    fields: list[str] = Field(min_length=1)

    @field_validator("fields")
    @classmethod
    def validate_confirmed_fields(cls, fields: list[str]) -> list[str]:
        if len(set(fields)) != len(fields) or any(field not in EDITABLE_FIELDS for field in fields):
            raise ValueError("fields must contain unique editable field names")
        return fields

class PublishTaskRequest(StrictModel):
    expectedRevision: StrictInt = Field(ge=1)

class AnalyzeRequest(StrictModel):
    description: str = Field(max_length=10000)
    answers: dict[str, str] = Field(default_factory=dict)

    @field_validator("answers")
    @classmethod
    def validate_answers(cls, answers: dict[str, str]) -> dict[str, str]:
        return validate_field_values(answers)

def validate_field_values(fields: dict[str, str]) -> dict[str, str]:
    invalid = set(fields) - set(EDITABLE_FIELDS)
    if invalid:
        raise ValueError(f"unknown editable fields: {', '.join(sorted(invalid))}")
    for name, value in fields.items():
        if not isinstance(value, str):
            raise ValueError(f"{name} must be a string")
        if len(value) > MAX_FIELD_LENGTH:
            raise ValueError(f"{name} exceeds {MAX_FIELD_LENGTH} characters")
    return fields

def blank_fields() -> dict[str, str]:
    return {field: "" for field in EDITABLE_FIELDS}