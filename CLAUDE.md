# PaperLess Campus

Before any task: read `docs/` (start with `docs/CONTEXT.md` and `docs/PROGRESS.md`) and the ground rules in `prompts.md`.

- Core workflow that must always work: submit → route by role → sign → seal → verify.
- Scope is core v1 only (see "Out of scope" in `docs/CONTEXT.md`). Do not add features outside it.
- UI: one central CTA per screen (`docs/DESIGN.md`). Do not write UI tests or run browser checks; the user tests the UI.
- Backend: build in bulk, `npm test` until green, then commit and push. Never push red.
- After every task: update `docs/PROGRESS.md`, append to `docs/DECISIONS.md`, and update any topic doc you touched.
- Product copy and docs describe the product only; never mention events, competitions or judges.
