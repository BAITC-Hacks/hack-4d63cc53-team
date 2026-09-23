# Backend ownership

- Stack: Python, FastAPI, Pydantic, SQLite, Uvicorn; OpenAI Responses API runs only on the server.
- Participant 2 owns the Python modules directly in backend/, requirements.txt and tests/core/.
- Participant 3 owns marketplace/ and tests/marketplace/. Follow their nested instructions without treating all backend files as participant 2's exclusive area.
- Participant 2 maintains app.py, configuration, task schema/repository, scoring and AI; participant 3 owns marketplace-specific routes, tables and business rules.
- Participant 3 exports an APIRouter from marketplace/router.py; participant 2 integrates it into app.py after the module exists.
- Read docs/PARTICIPANT_2.md for the repository seam and published task shape.
- Do not overwrite teammate changes, use live API keys in tests, or commit runtime SQLite files.
