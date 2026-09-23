# Участник 2: серверная часть

Статус: backend core реализован. Целевые автоматические тесты выполняет tester-агент после разделения каталогов.

## Модули

- `backend/app.py` — фабрика FastAPI и маршруты.
- `backend/schemas.py` — строгая валидация HTTP-тел.
- `backend/db.py` — SQLite-репозиторий и опубликованные снимки.
- `backend/tasks.py` — жизненный цикл черновика.
- `backend/scoring.py` — чистый расчёт рейтинга.
- `backend/ai.py` — OpenAI Responses и fallback.

## Запуск

Создайте `.env` из `.env.example`, добавьте `OPENAI_API_KEY` только в локальный файл, затем выполните:

```powershell
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
```

Документация доступна по `http://127.0.0.1:8000/docs`. SQLite по умолчанию хранится в `backend/runtime/app.sqlite3`. CORS разрешает локальные адреса frontend-разработки и меняется переменной `CORS_ORIGINS`.

## Контракт API

Редактируемые поля: `topic`, `title`, `context`, `need`, `users`, `data`, `constraints`, `expectedResult`, `successCriteria`, `contact`, `interactionFormat`, `feedbackProcess`.

- `POST /api/tasks`: `{"rawDescription":"...","fields":{"topic":"..."}}` создаёт черновик.
- `GET /api/tasks` и `GET /api/tasks/{id}` возвращают карточку с редактируемыми полями на верхнем уровне: `id`, `rawDescription`, `revision`, все поля, `confirmedFields`, `score`, `scoreBreakdown`, `missingFields`, `readiness`, `publicationStatus`, `publishedVersion`.
- `PATCH /api/tasks/{id}`: `{"expectedRevision":1,"fields":{"need":"..."}}`. Изменение поля снимает только его подтверждение.
- `POST /api/tasks/{id}/confirm`: `{"expectedRevision":2,"fields":["need","context"]}`.
- `POST /api/tasks/{id}/publish`: `{"expectedRevision":3}`.
- `POST /api/analyze`: `{"description":"...","answers":{"need":"..."}}` возвращает `fields`, минимум три `questions`, `missingFields`, `mode`, `reason`.

Все изменяющие запросы требуют целочисленный `expectedRevision`. При конфликте сервер возвращает `409` и текущую карточку в `detail.task`.

`publishedVersion` — независимый публичный снимок: `taskId`, `version`, `publishedAt`, вложенные `fields`, `confirmedFields`, `score`, `scoreBreakdown`, `missingFields`, `readiness`. В `fields` снимка остаются только подтверждённые значения. Низкий балл не блокирует публикацию.

Пример PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/tasks -Method Post -ContentType 'application/json' -Body '{"rawDescription":"Нужно улучшить запись клиентов"}'
```

## Оценка

Сервер считает подтверждённые непустые поля в семи группах на 100 баллов: контекст и потребность 20, данные 20, результат 15, критерии 15, ограничения 10, пользователи 10, связь с бизнесом 10. Уровни: `draft` 0–39, `working` 40–69, `ready` 70–89, `priority` 90–100.

## Интеграция участника 3

Каталог участника 3 принадлежит `backend/marketplace/**` и `frontend/marketplace/**`. Он читает `TaskRepository.list_published_tasks() -> list[dict]`; `taskId` служит идентификатором карточки, а вложенный `fields` — публичными данными. Для маршрутов маркетплейса зарегистрируйте свой `APIRouter` в factory `create_app`, используя `application.state.task_repository` или `application.state.task_service`. Не меняйте таблицы и модули участника 2.

## OpenAI

Адаптер вызывает `POST https://api.openai.com/v1/responses`, использует `OPENAI_MODEL` (по умолчанию `gpt-4.1-mini`), `store:false`, строгую JSON Schema и таймаут 15 секунд. Неизвестные значения остаются пустыми; AI не придумывает контакты, сроки, метрики или источники. Результат анализа требует ручного подтверждения и не сохраняется автоматически. При отсутствии ключа, ошибке сети, таймауте или неверном ответе возвращается `fallback`, сохраняющий введённые значения и дающий три разных вопроса.