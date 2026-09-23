# Project Codex instructions

- Communicate in the user's language unless they request another language.
- Inspect the relevant files and existing conventions before editing.
- Keep changes focused on the requested task; preserve unrelated user changes.
- Prefer small, readable, maintainable solutions over unnecessary abstraction.
- Run the most relevant formatting, linting, type-checking, or tests after changes when practical, and report what was verified.
- Do not make destructive changes, publish code, or contact external services without explicit user authorization.
- Ask a concise clarifying question when a decision would materially affect scope or behavior.

## Project commands

- Before adding or changing tooling, inspect the repository manifests and existing scripts to determine the real install, run, build, lint, and test commands.
- Once the project stack is initialized, record the verified commands and the frontend/backend locations in this file or README.md. Do not invent commands.

## Specialized agents

Use the lightest workflow that safely fits the task:

- For an ambiguous, multi-step, or high-risk feature: `architect` → `developer` → `tester` → `readme_writer` → `committer`.
- For a small, well-understood code fix: `developer` → `tester`; use `readme_writer` only if user-facing documentation changed.
- For a documentation-only task: use `readme_writer` without the implementation agents.

For a full feature workflow, wait for each step to finish and pass its result to the next step:

1. Ask `architect` to analyze the task and return a focused implementation plan.
2. Ask `developer` to implement the architect's plan unless it reveals a material decision that requires user input.
3. Ask `tester` to add or run focused automated tests for the implemented behavior.
4. Ask `readme_writer` whether `README.md` needs an update; when it does, make it detailed, structured, accurate, and suitable for jury evaluation.
5. Ask `committer` to create one local commit only when the user has explicitly requested a commit after the work is reviewed.

- Do not start a later step if an earlier step fails, reveals a blocking issue, or needs a material user decision.
- The `committer` must not push, create a pull request, amend, reset, rebase, or discard changes.

## Team ownership

- Use the participant responsibilities and file ownership in DEVELOPMENT_PLAN.md to scope each task.
- State the assigned participant and permitted files in every subagent task. Reading other modules for integration context is allowed.
- Edit only the assigned participant's files and explicitly assigned supporting files. If an integration requires changing another participant's module or a shared contract, describe the required change and coordinate it before editing that module.
- Preserve teammates' in-progress and uncommitted changes; never revert or overwrite them to make your own task pass.
- Keep reusable project instructions applicable to all participants; do not globally assign the repository to one participant.

## Workspace map

- Participant 1: frontend entry files, frontend/business/ and frontend/shared/.
- Participant 2: backend root modules, backend/requirements.txt, backend/tests/core/, .env.example and docs/PARTICIPANT_2.md.
- Participant 3: frontend/marketplace/, backend/marketplace/, backend/tests/marketplace/, data/ and README.md.
- Detailed ownership and integration contracts are authoritative in DEVELOPMENT_PLAN.md section 4; inspect nested AGENTS.md for each assigned directory.
- Keep app.py and task schema changes with participant 2, and frontend shell/shared-client changes with participant 1. Request integration changes from the relevant owner.
- Separate clones or worktrees plus participant branches isolate parallel working copies. Directories and instructions alone do not enforce write isolation.

## Implemented stack and verified commands

- Backend core: backend/ (Python, FastAPI, Pydantic, SQLite, Uvicorn). Runtime dependencies are pinned in backend/requirements.txt.
- Frontend location: frontend/ (HTML/CSS/JavaScript ES modules); the participant directories exist, while their screens are still to be implemented by participants 1 and 3.
- From the repository root, verified server command: `python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000`. The smoke check used a temporary database and disabled the OpenAI key.
- Verified HTTP surfaces: /api/health, /openapi.json, /docs and /api/analyze in explicit fallback mode.
- OpenAI runtime configuration: local .env / OPENAI_API_KEY and OPENAI_MODEL. Never require a real API call for automated core tests.
- Verified core tests: `python -m unittest discover -s backend/tests/core -p 'test_*.py' -v` (15 passed; temporary databases and mocked AI).
