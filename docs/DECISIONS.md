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
17. **QR carries `(rid, v)` + Ed25519 signature, not the file hash** (a file cannot contain its own hash). File upload → SHA-256 → chain; QR → signature offline, status online by `(rid, v)`.
18. **Anchor SHA-256 of the final PDF bytes.** Any one-byte edit fails.
19. **Compile Solidity with the `solc` npm package**, not Hardhat's downloader (blocked in some networks). EVM target `paris` for Amoy compatibility.
20. **Contract address stored per database** (`kv`), not in a shared file: a fresh database gets a fresh contract, so `PLC-YYYY-0001` never collides with an earlier run on the same chain.
21. **Check contract code before every chain call; redeploy + replay if missing.** A write to an address without code would otherwise "succeed".
22. **Queue-and-retry anchoring** (`seals.anchor_status`, retried every 5 s): sealing never blocks on the chain; verify says `pending` until anchored.
23. **No "Verified" stamp printed on the PDF.** Only a live scan may say Verified; an old version must read Superseded.
24. **PDF uses standard Helvetica/Courier** (no font embedding) to keep it small and deterministic; colours follow the deck.
25. **jsQR for scanning** (live camera loop + decode from photo), no heavier scanner library. Photo decode covers plain-http LAN setups where browsers block live camera.
26. **Verify page never says "Verified" without a live Active status**; an offline QR check with a good signature reads "Signature valid".
27. **Public verify endpoints rate limited** in memory: 60 per IP per minute (`apps/api/src/ratelimit.ts`).
28. **Issuer public key cached in localStorage** by the verify page so signature checks keep working offline (used again by the gate in prompt 9).
29. **Amendment = same request, version n+1, new round.** `createRound` is reused with only the affected steps; unaffected roles get `carried` rows that always point at the originally signed approval (follows chains of carries).
30. **`purpose` sends the amendment to the faculty coordinator**, so every field change reaches at least one approver and nothing gets re-sealed without a signature.
31. **A returned or rejected amendment ends only the amendment** and restores `current_version` and round to the sealed version; the abandoned round stays in the history.
32. **v2 is sealed through the same pipeline with `prevHash` = v1**, so the on-chain link and v1 → Superseded happen in prompt 6 already; prompt 7 adds history and UI on top.
33. **One verdict function in `packages/shared`** (`verdictFor`), so the API, verify page and gate cannot disagree on precedence.
34. **A genuine document checked before its date reads Verified (with "valid from …")**, not "not valid"; only the gate turns that into NOT TODAY. Past the window it reads Expired.
35. **Revocation is per request, applied to every version.** Revoking v2 also makes the old v1 read Revoked (Revoked beats Superseded), so no copy of a cancelled approval can pass.
36. **The database revocation counts immediately; the chain write is queued.** A revoked document never reads Verified during a chain outage.
37. **Public verify exposes the revoking role and date, not the reason or name** (no personal data in public answers).
38. **Revocation list includes superseded versions**, so an old v1 QR is caught offline even if it carried a still-valid-looking date.
39. **Test chain clients remember their contract address** (like production's `kv`), so reconnects after a simulated outage reuse the same contract.
40. **Gate decision is one pure function in `packages/shared` (`gateCheck`)**, tested under a fake clock in the API test suite; the gate page only adds storage, sync and the camera.
41. **Revocation list and issuer key live in the phone's local storage**, the app shell in a hand-written service worker (no extra PWA plugin). Service worker registers in production builds only.
42. **Live status is tried for 2.5 s per scan and wins over the cache**; a slow network never blocks the guard.
43. **Stale = list older than 12 h or not from today (IST)**; offline VALID results then carry an amber warning.
44. **The signed-in profile is cached for offline use**; only a 401 clears it.
45. **`npm run dev:https -w apps/web`** (self-signed, `@vitejs/plugin-basic-ssl`) for camera and service worker on LAN phones.
46. **Demo seed dates Riya's v1 a week ahead; the live amendment moves it to today**, so one step shows the twist's date change and a VALID gate scan, while v1 reads SUPERSEDED / NOT TODAY.
47. **Admin reset clears the stored contract address**, so each reset gets a fresh contract and request ids restart cleanly.
48. **One port in production**: the API serves the built web app; `tsx` is a runtime dependency of the API (no separate compile step).
49. **End-to-end test runs the whole demo script** (`apps/api/test/demo.e2e.test.ts`) and scans every chain transaction's calldata for personal data.
