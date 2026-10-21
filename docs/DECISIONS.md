# Decisions (append-only)

1. **TypeScript monorepo with npm workspaces** (`apps/api`, `apps/web`, `packages/shared`, `contracts`): one language, shared types and crypto between API and browser.
2. **SQLite over Supabase** for v1: zero setup, runs offline. Schema kept Postgres-compatible for a later move.
3. **Profile login with a 4-digit PIN + JWT**: no email/OTP infrastructure; PIN doubles as the sign-off confirmation for approvals. All demo profiles use PIN 1234.
4. **Built deck theme "Public Record" is the design source**, not the indigo/Poppins palette in the pitch-content Markdown. Amber `warn` added for Superseded/Returned/Not today.
5. **Ed25519 (`@noble/ed25519`) for approval signatures and the QR payload**, so the browser can verify offline with the same code.
6. **Chain: real `DocumentRegistry` contract; local Hardhat node by default, Polygon Amoy via `CHAIN_MODE=amoy`**, so demos do not depend on testnet uptime.
7. **API runs TypeScript directly with `tsx`** (no compile step); `packages/shared` is consumed as TS source by both apps.
