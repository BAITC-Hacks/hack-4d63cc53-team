# Participant 3: marketplace server

- This directory belongs to participant 3: catalog filtering, teams, proposals, manual selection/rejection and one-time milestone points.
- Keep routes, validation and marketplace-specific SQL schema here. Export router from router.py for participant 2 to connect.
- Read published snapshots through TaskRepository.list_published_tasks(); do not write to the task table or alter core scoring.
- Use the agreed database path. Coordinate task schema and app.py changes with participant 2.
- Place tests in backend/tests/marketplace/. No automatic team assignment or points for merely submitting a proposal.
