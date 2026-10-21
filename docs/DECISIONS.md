# Decisions (append-only)

1. **TypeScript monorepo with npm workspaces** (`apps/api`, `apps/web`, `packages/shared`, `contracts`): one language, shared types and crypto between API and browser.
2. **SQLite over Supabase** for v1: zero setup, runs offline. Schema kept Postgres-compatible for a later move.
3. **Profile login with a 4-digit PIN + JWT**: no email/OTP infrastructure; PIN doubles as the sign-off confirmation for approvals. All demo profiles use PIN 1234.
4. **Built deck theme "Public Record" is the design source**, not the indigo/Poppins palette in the pitch-content Markdown. Amber `warn` added for Superseded/Returned/Not today.
5. **Ed25519 (`@noble/ed25519`) for approval signatures and the QR payload**, so the browser can verify offline with the same code.
6. **Chain: real `DocumentRegistry` contract; local Hardhat node by default, Polygon Amoy via `CHAIN_MODE=amoy`**, so demos do not depend on testnet uptime.
7. **API runs TypeScript directly with `tsx`** (no compile step); `packages/shared` is consumed as TS source by both apps.
8. **Approval rows for the whole round are created up front** (`waiting` → `pending` → decided). Advancing is a status flip, parallel steps are rows with the same `step_no`, and amendments reuse the same function with a subset of steps.
9. **Resubmit after Return reuses the same version and bumps `round`**: a version only becomes immutable once sealed; versions are reserved for post-seal amendments.
10. **Return and Reject require a comment**, so the student always sees why.
11. **No draft state**: a request exists from submit. Keeps the student flow to one screen.
12. **Request IDs `PLC-YYYY-NNNN`**, readable for students and approvers.
13. **Live updates by polling** (`useLive`, 5 s, visible tab only) instead of websockets: zero server changes, good enough for a campus app; swap for SSE later if needed.
14. **Security's home stays /gate** with a secondary link to /inbox, because Security is both the gate checker and a parallel approver on event permissions.
15. **One responsive layout, not separate desktop screens**: `Page wide` + Tailwind `md`/`lg` breakpoints. Same CTA per screen on every size.
16. **Only a 401 from /api/me signs the user out.** Network errors or aborted fetches keep the session (previously any failure cleared the token, which logged people out on flaky networks).
