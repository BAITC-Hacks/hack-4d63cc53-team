# HackAlem Task Marketplace

MVP для цепочки «описание задачи бизнеса → уточнение и подтверждение → публикация → отклики команд → ручной выбор → подтверждённый этап». Данные задач сохраняются в SQLite, а AI-анализ выполняется только сервером.

## Запуск

```powershell
Copy-Item .env.example .env
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
```

Откройте `http://127.0.0.1:8000/docs`. Для демонстрационных данных выполните `python data/seed_demo.py`. Скрипт создаёт пять синтетических задач, подтверждает и публикует их через core-сервис, затем создаёт пять команд и пять связанных откликов. Он добавляет новые записи при каждом запуске.

## Marketplace (участник 3)

Маршруты реализованы в `backend/marketplace/router.py`; участнику 2 нужно добавить в `create_app`:

```python
from .marketplace.router import router as marketplace_router
application.include_router(marketplace_router)
```

После подключения доступны:

- `GET /api/catalog?topic=&readiness=` — только опубликованные снимки, по умолчанию по убыванию рейтинга;
- `GET/POST /api/teams` — профили команд;
- `POST /api/proposals`, `GET /api/tasks/{taskId}/proposals`, `PATCH /api/proposals/{proposalId}` — отклики и ручное решение `selected`/`rejected`;
- `POST /api/milestones`, `POST /api/milestones/{milestoneId}/confirm` — этап и однократные +10 баллов выбранной команде.

Каталог не показывает черновики. Низкий рейтинг не мешает опубликованной задаче получать отклики. Автоматического назначения нет; можно выбрать несколько предложений. Повторное подтверждение того же этапа не начисляет баллы снова.

Клиентские экраны экспортируются из `frontend/marketplace/marketplace.js`: `createCatalogScreen`, `createTeamsScreen`, `createProposalScreen`, `createProposalReviewScreen`, `createMilestoneScreen`. Их подключение в общую оболочку выполняет участник 1.

## Проверки и ограничения

Проверка модуля marketplace:

```powershell
python -m unittest backend.tests.marketplace.test_marketplace
```

Тест покрывает фильтры и сортировку каталога, ручной статус предложения, запрет начисления невыбранной команде и защиту от двойного начисления. В MVP нет аутентификации: разграничение ролей и проверка, что решение принимает представитель бизнеса, остаются задачей следующей версии. Контакты и ссылки в seed-наборе синтетические.

Copy-Item .env.example .env