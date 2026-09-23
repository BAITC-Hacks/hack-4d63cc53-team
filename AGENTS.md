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