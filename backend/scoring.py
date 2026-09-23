from __future__ import annotations

from .schemas import EDITABLE_FIELDS

GROUPS = (
    ("Контекст и потребность", ("context", "need"), 20),
    ("Данные", ("data",), 20),
    ("Ожидаемый результат", ("expectedResult",), 15),
    ("Критерии успеха", ("successCriteria",), 15),
    ("Ограничения", ("constraints",), 10),
    ("Пользователи", ("users",), 10),
    ("Связь с бизнесом", ("contact", "interactionFormat", "feedbackProcess"), 10),
)

def readiness_for(score: int) -> str:
    if score < 40: return "draft"
    if score < 70: return "working"
    if score < 90: return "ready"
    return "priority"

def calculate_score(fields: dict[str, str], confirmed_fields: set[str]) -> dict:
    breakdown, missing, total = [], [], 0
    for label, required, points in GROUPS:
        complete = all(name in confirmed_fields and fields.get(name, "").strip() for name in required)
        awarded = points if complete else 0
        total += awarded
        if not complete:
            missing.extend(name for name in required if not (name in confirmed_fields and fields.get(name, "").strip()))
        breakdown.append({"label": label, "fields": list(required), "points": awarded, "maxPoints": points,
                          "reason": "Подтверждено и заполнено" if complete else "Нужно подтвердить и заполнить все поля группы"})
    # Fields outside scoring groups remain visible as missing metadata.
    for name in EDITABLE_FIELDS:
        if not (name in confirmed_fields and fields.get(name, "").strip()) and name not in missing:
            missing.append(name)
    return {"score": total, "scoreBreakdown": breakdown, "missingFields": missing, "readiness": readiness_for(total)}