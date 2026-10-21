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

## Tables (so far)

`departments`, `users (pin_hash)`, `user_roles (user_id, role, department_id)`, `migrations`.

## Request state machine (prompt 2)

Draft → Submitted → In review (step n) → Approved | Rejected | Returned → Sealed → (Superseded | Revoked). Returned goes back to the student, who can edit and resubmit.
