# Architecture

## Repo layout

| Path | What |
| --- | --- |
| `apps/api` | Express + TypeScript API, SQLite (`better-sqlite3`), run with `tsx` |
| `apps/api/db/*.sql` | Migrations, applied in name order on startup (`src/db.ts`) |
| `apps/web` | React + Vite + Tailwind, React Router; `/api` proxied to :4000 in dev |
| `packages/shared` | Types, role labels, routing helpers; later canonical JSON, hashing, QR codec, verify precedence (used by API and browser) |
| `contracts` | Solidity `DocumentRegistry`, compiled with solcjs (`scripts/compile.mjs`); `lib/index.ts` exports the artifact, `deployRegistry`, `startLocalNode`; Hardhat only runs the local node |
| `docs` | Project memory for Claude |
| `deploy` | EC2 bootstrap, update and backup scripts, systemd units, Caddyfile (see `docs/DEPLOY_AWS.md`) |

## Stack

Node 20+, TypeScript, Express, SQLite, JWT (12 h), bcrypt PINs, pdf-lib + qrcode, `@noble/ed25519`, ethers v6, Hardhat (local) or Polygon Amoy. Tests: Vitest + Supertest, Hardhat.

## Commands

`npm install` · `npm run dev` (local chain :8545 + API :4000 + web :5173) · `npm run dev:https -w apps/web` (https dev server for phones) · `npm test` (API + contract) · `npm run build` · `npm start` (API + built web app on one port) · `npm run start:local` (local chain + `npm start`) · `npm run seed` (people only) · `npm run seed:demo` (demo starting point) · `npm run compile -w contracts`.

Production: the API serves `apps/web/dist` (hashed assets cached for a year, `index.html` and `sw.js` no-cache) with an SPA fallback; unknown `/api/*` paths return JSON 404. `TRUST_PROXY=1` behind a reverse proxy. In `NODE_ENV=production` the API refuses to start without `JWT_SECRET`. Basic security headers are set on every response.

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
| `comments (request_id, author_id, version, body, created_at)` | Discussion thread per request |
| `attachments (id, owner_id, request_id, version, name, mime, size, sha256, path)` | Uploaded files; unlinked until claimed by submit / resubmit / amend |
| `delegations (user_id, delegate_id, starts_on, ends_on)` | Away periods; `approvals.on_behalf_of` records who a delegate signs for |
| `outbox (to_user, to_addr, subject, body_text, kind, request_id, status, attempts, last_error)` | Email notifications, written in the same transaction as the event |
| `revocations (request_id, version, doc_hash, role, actor_id, reason, reason_code, signature, anchor_status, tx_hash, …)` | One per revoked request; see `docs/TRUST.md` |
| `seals (request_id, version, doc_hash, prev_hash, roles_hash, pass, pdf_path, valid_from, valid_until, anchor_status, chain_status, tx_hash, attempts, last_error)` | One per sealed version; see `docs/TRUST.md` |

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
| POST | /api/requests/:id/amend `{changes, reason}` | Owner, when sealed (see `docs/CONTEXT.md` amendment table) |
| GET | /api/inbox (pending for me, oldest first, full detail + approvalId, myRole) | Approvers |
| POST | /api/approvals/:id/decide `{decision, comment, pin}` | Assignee (last approval triggers sealing) |
| GET | /api/requests/:id/pdf `?v=n` | Owner, anyone on the chain, admin |
| GET | /api/verify/hash/:hash · /api/verify/ref/:rid/:v | Public |
| GET | /api/health (includes chain network + contract) | Public |
| GET | /api/requests/:id/history | Owner, anyone on the chain, admin |
| GET | /api/admin/requests · POST /api/admin/reset-demo | Admin |
| GET | /api/admin/stats · /api/admin/audit `?request=&limit=` · /api/admin/emails · POST /api/admin/run-sla | Admin |
| POST | /api/attachments (raw body; `Content-Type` = file type, `X-Filename`) → `{id, name, sha256, …}` · GET /api/attachments/:id | Student uploads; owner / request viewers download |
| POST | /api/approvals/batch `{ids, pin}` | Approvers |
| POST | /api/requests/:id/reopen `{reason, pin}` | The rejecting approver, HoD or Dean SA (rejected requests only) |
| GET / POST | /api/requests/:id/comments `{body}` | Anyone who can view the request |
| GET / POST / DELETE | /api/delegations · /api/delegations/:id | Approvers |
| POST | /api/requests/:id/revoke `{reason, pin}` | HoD / Dean SA of the department |
| GET | /api/revocations (signed list) | Public |

Errors: `{error}` with 400 / 401 / 403 / 404 / 409 / 422 via `HttpError`.

## Tests

API tests start one Hardhat node (`test/global-setup.ts`, port 8621); each `setup()` deploys a fresh contract with a per-worker dev account. Contract tests use port 8611; the restart test uses 8631.

## Background loops (`apps/api/src/server.ts`)

Every 5 s: anchor pending seals and revocations (`processQueue`), deliver pending emails (`processOutbox`). Every 60 s (15 s with `SLA_MINUTES`): deadline check (`runSla` in `ops.ts`).

## Request state machine

in_review → approved | rejected | returned; returned → (resubmit, selective) in_review; rejected → (reopen) returned; approved → sealing (PDF built, anchor pending) → sealed (on chain); sealed → (amend) amending → approved → sealing → sealed as v(n+1), or amending → (return/reject) sealed at v(n); sealed | amending → (revoke) revoked. Later: superseded | revoked (prompts 7, 8). There is no draft state: a request is created on submit. `GET /api/requests/:id` includes `seal` (latest version's hash, anchor state, tx, validity).
