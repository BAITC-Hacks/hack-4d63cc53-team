# Frontend ownership

- Stack: HTML, CSS and native JavaScript ES modules for the MVP. Do not introduce a framework or build tooling without a team decision.
- Participant 1 owns index.html, styles.css, app.js, business/ and shared/.
- Participant 3 owns marketplace/. This exception must remain available to participant 3.
- Only participant 1 integrates screens into app.js or changes the shared HTTP client. Participant 3 requests those integration changes.
- Read DEVELOPMENT_PLAN.md section 4 and the nearest nested AGENTS.md before editing.
- Use the server API for persisted data and computed scores; never place an OpenAI key in frontend code.
