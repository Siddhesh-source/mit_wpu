# CampusSign

Before any task: read `docs/` (start with `docs/CONTEXT.md` and `docs/PROGRESS.md`) and the ground rules in `prompts.md`.

- Core workflow that must always work: submit → route by role → sign → seal → verify.
- Scope: core v1 plus the operations features in `docs/CONTEXT.md` (attachments, SLA, delegation, no-dues, batch approve, impact, audit, email, open sign-up, student workspace, send to anyone). Anything under "Out of scope" needs the user's go-ahead.
- UI: one central CTA per screen (`docs/DESIGN.md`). Do not write UI tests or run browser checks; the user tests the UI.
- Backend: build in bulk, `npm test` until green, then commit and push. Never push red.
- After every task: update `docs/PROGRESS.md`, append to `docs/DECISIONS.md`, and update any topic doc you touched.
- Product copy and docs describe the product only; never mention the competition, judges or how this build is being evaluated.
