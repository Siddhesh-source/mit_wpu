# Architecture

## Repo layout

| Path | What |
| --- | --- |
| `apps/api` | Express + TypeScript API, SQLite (`better-sqlite3`), run with `tsx` |
| `apps/api/db/*.sql` | Migrations, applied in name order on startup (`src/db.ts`) |
| `apps/web` | React + Vite + Tailwind, React Router; `/api` proxied to :4000 in dev |
| `packages/shared` | Types, role labels, routing helpers; later canonical JSON, hashing, QR codec, verify precedence (used by API and browser) |
| `contracts` | Solidity `DocumentRegistry` + Hardhat (prompt 4) |
| `docs` | Project memory for Claude |

## Stack

Node 20+, TypeScript, Express, SQLite, JWT (12 h), bcrypt PINs, pdf-lib + qrcode, `@noble/ed25519`, ethers v6, Hardhat (local) or Polygon Amoy. Tests: Vitest + Supertest, Hardhat.

## Commands

`npm install` · `npm run dev` (API :4000 + web :5173) · `npm test` · `npm run build` · `npm run seed`.

## Auth

`GET /api/profiles` (public, no PIN data) → `POST /api/auth/login {userId, pin}` → JWT `{sub, roles}` → `Authorization: Bearer`. Middleware: `requireAuth`, `requireRole(...roles)` in `apps/api/src/auth.ts`. Home route by role: `homeFor()` in `packages/shared`.

## Tables

| Table | Purpose |
| --- | --- |
| `departments`, `users (pin_hash)`, `user_roles (user_id, role, department_id)` | People and roles per department |
| `kv` | Issuer Ed25519 private key (`issuer_private_key`) unless `ISSUER_PRIVATE_KEY` is set |
| `request_types (code, name, fields_json)` | Catalogue, seeded from `apps/api/src/catalog.ts` |
| `route_steps (request_type, step_no, role, affected_by_json)` | Role chain; same `step_no` = parallel; `affected_by` = fields that send a step back on amendment |
| `requests (id PLC-YYYY-NNNN, student_id, department_id, type, status, current_version, round)` | One row per request; `round` increments on resubmit |
| `request_versions (request_id, version, form_json, form_hash, reason)` | Form per version; `form_hash` = SHA-256 of canonical JSON |
| `approvals (request_id, version, round, step_no, role, assignee_id, decision, comment, opened_at, signed_at, signature, carried_from)` | One row per role per round |
| `audit_log (request_id, actor_id, action, version, details_json, at)` | Every state change |

## Routing engine (`apps/api/src/workflow.ts`)

- On submit, every role in the chain is resolved to a person (`resolveRole`, by department) and gets an approval row: lowest step `pending`, the rest `waiting`.
- Approve: when no `pending` row is left in that step, the next `waiting` step opens; when none is left, the request is `approved`.
- Reject → request `rejected`; Return → request `returned` (comment required for both); the rest of the round is `cancelled`.
- Resubmit (only from `returned`): overwrites the unsealed version's form, `round + 1`, new rows for the full chain. Timeline shows the current round.
- `createRound(steps)` takes any subset of steps, which the amendment flow (prompt 6) reuses with only affected roles.

Approval decisions: `waiting | pending | approved | rejected | returned | cancelled | carried`.

## Signing

Approve/Return/Reject require the approver's PIN. The server signs canonical JSON `{requestId, version, role, approverId, decision, formHash, signedAt}` with the issuer Ed25519 key and stores the hex signature on the approval row. Helpers in `packages/shared/src/crypto.ts`: `canonicalJson`, `sha256Hex`, `signJson`, `verifyJson`.

## Endpoints

| Method | Path | Who |
| --- | --- | --- |
| GET | /api/profiles · POST /api/auth/login · GET /api/me | Public / any |
| GET | /api/request-types · /api/issuer-public-key | Public |
| POST | /api/requests `{type, form}` | Student |
| GET | /api/requests/mine | Student |
| GET | /api/requests/:id (detail + timeline + lastComment) | Owner, anyone on the chain, admin |
| POST | /api/requests/:id/resubmit `{form}` | Owner, when returned |
| GET | /api/inbox (pending for me, oldest first, full detail + approvalId, myRole) | Approvers |
| POST | /api/approvals/:id/decide `{decision, comment, pin}` | Assignee |

Errors: `{error}` with 400 / 401 / 403 / 404 / 409 / 422 via `HttpError`.

## Request state machine

in_review → approved | rejected | returned; returned → (resubmit) in_review. Later: approved → sealed → superseded | revoked (prompts 4, 7, 8). There is no draft state: a request is created on submit.
