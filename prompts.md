# CampusSign — Build Prompts

Ten prompts that take this repo from a pitch deck to a working product: the core workflow first (submit → route by role → sign → seal → verify), then the "Plan Changed" twist (amend, version, revoke, offline gate check).

Run them in order, one per session or one per turn. Each prompt is self-contained, reads `/docs` first and updates `/docs` last, so context survives between sessions.

## Ground rules (apply to every prompt)

- **Source of truth for the product:** `CampusSign — Project Overview.md`, `CampusSign — Pitch Deck Content (10 slides).md` and the built deck `out/deck.pptx` (previews in `out/previews/`). Where the two Markdown files and the built deck disagree on visuals, the **built deck wins** (theme "Public Record" in `out/source/kit.py`).
- **Scope is core v1 only.** No LLM/AI features, no DigiLocker, no Aadhaar eSign, no WhatsApp/email notifications, no SLA escalation, no delegation, no no-code form builder, no analytics dashboard. If something is not needed to demo the core workflow or the twist, do not build it.
- **UI:** one primary CTA at the centre of every screen; everything else is secondary. Mobile-first, big tap targets, no nested menus, no modals except a confirm sheet. **Do not write UI tests and do not run browser checks; the user tests the UI.**
- **Backend:** build features in bulk per prompt, then test them in bulk (`npm test`), fix until green, then commit and push. Never push red.
- **Engineering:** simplest thing that works. TypeScript everywhere, one repo, no microservices, no ORM magic, no premature abstractions.
- **Docs:** every prompt ends by updating `/docs` (`docs/CONTEXT.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`, plus any topic file it touched).
- **Wording:** product copy and docs describe a product, not an event. Do not mention the competition, judges, or "pilot build" anywhere in code, UI or docs.

## Fixed stack (decided once, do not revisit)

| Layer | Choice | Why |
| --- | --- | --- |
| Repo | npm workspaces: `apps/api`, `apps/web`, `packages/shared`, `contracts` | One install, one language, shared types and crypto |
| Frontend | React + Vite + TypeScript + Tailwind, React Router | Fast to build, static build serves anywhere |
| Backend | Node 20 + Express + TypeScript | Plain and quick |
| Database | SQLite via `better-sqlite3`, SQL migrations in `apps/api/db/` | Zero setup; schema kept Postgres-compatible for a later Supabase move |
| Auth | Profile login: pick a profile card, enter 4-digit PIN, get a JWT | "Profile-based login", no email/OTP infra needed |
| PDF | `pdf-lib` + `qrcode` | Generate the sealed approval letter with QR |
| Hashing | SHA-256 of the final PDF bytes | As in the deck: "SHA-256 fingerprint" |
| Signatures | Ed25519 via `@noble/ed25519` (server issuer key) | Signs approvals and the offline QR payload; verifiable in the browser with no network |
| Chain | Solidity `DocumentRegistry` + `ethers` v6; `CHAIN_MODE=local` (Hardhat node, default) or `CHAIN_MODE=amoy` (Polygon Amoy testnet, per deck) | Real contract either way; local mode keeps the demo independent of testnet uptime |
| Tests | Vitest + Supertest (API), Hardhat tests (contract) | Fast bulk testing |

## Design tokens (from the built deck, theme "Public Record")

| Token | Value | Use |
| --- | --- | --- |
| `bg` | `#FFFFFF` | Page background |
| `panel` | `#F4F6F8` | Cards |
| `rule` | `#E1E4E8` | Borders, dividers, timeline track |
| `ink` | `#101418` | Headings, primary text |
| `muted` | `#5A6370` | Secondary text |
| `faint` | `#6B7480` | Captions |
| `accent` | `#1D4F91` | Primary CTA, links, pending step rings |
| `ok` / `ok_bg` | `#1E7A4C` / `#E8F3EC` | Approve, Verified, sealed tick |
| `bad` / `bad_bg` | `#B42318` / `#FBEAE8` | Reject, Tampered, Revoked |
| `warn` / `warn_bg` | `#B54708` / `#FEF0C7` | Superseded, Returned, outside validity (added; not in deck) |
| Fonts | Public Sans (400/600/700), IBM Plex Mono (hashes, IDs) | Same as deck |

Visual motifs to reuse from slides 4 and 7: the horizontal step track with hollow accent rings and a filled green tick at the end; the vertical role chain with Security branching in parallel; the phone card with green **Approve** and outlined **Return** buttons.

## Domain facts the backend must match (from the deck)

- **Roles:** Student, Faculty coordinator, HoD, Dean Student Affairs (Dean SA), Security, Admin. Routing is by role, resolved to a person by the student's department.
- **Event permission chain:** Faculty coordinator → (HoD ‖ Security in parallel) → Dean SA → sealed. (Slide 7: Security branches off after the coordinator and runs in parallel with HoD.)
- **Catalogue for v1:** Event permission (full chain), On-duty (Faculty coordinator → HoD), Bonafide (HoD → Dean SA). Only Event permission needs every twist feature.
- **States:** Draft → Submitted → In review (step n) → Approved | Rejected | Returned → Sealed → (Superseded | Revoked).
- **On chain:** document hash, request ID, request type, version, previous-version hash, signer roles, timestamps, status. **Never** names, roll numbers or any personal data.
- **Off chain:** the PDF, form data, comments, audit log.
- **Verify:** re-hash the PDF and compare with the chain. One changed character means Tampered.
- **Seed people:** Riya (Student, CSE 2nd year), Prof. Mehta (Faculty coordinator, CSE), Prof. Kulkarni (HoD, CSE), Dr. Rao (Dean SA), Mr. Pawar (Security), Admin. Riya's demo request: "Robotics fest", Hall B, 5 Nov, 120 students.

---

## Prompt 1 · Foundation, docs and profile login

```
Read prompts.md (ground rules, fixed stack, design tokens, domain facts), both "CampusSign — *.md" files, out/source/kit.py and the PNGs in out/previews/. Then build the foundation in one pass.

1. Monorepo: npm workspaces with apps/api, apps/web, packages/shared, contracts. Root scripts: `npm run dev` (api + web together), `npm test`, `npm run build`, `npm run seed`. Add .gitignore (node_modules, dist, *.sqlite, .env). Add .env.example with JWT_SECRET, ISSUER_PRIVATE_KEY, CHAIN_MODE, AMOY_RPC_URL, AMOY_PRIVATE_KEY, PUBLIC_BASE_URL.

2. /docs (this is Claude's long-term memory for the project; keep each file short and factual):
   - docs/CONTEXT.md: what the product is, the core workflow, roles, the event-permission chain, the on-chain vs off-chain split, the twist requirements (amend, versioned seal, revoke, offline gate check), and what is out of scope for v1.
   - docs/ARCHITECTURE.md: repo layout, stack table, request state machine, data flow from submit to verify.
   - docs/DESIGN.md: the design tokens and motifs from prompts.md, and the "one central CTA per screen" rule with the CTA for each role.
   - docs/DECISIONS.md: numbered decision log (stack choices, SQLite over Supabase, local Hardhat default with Amoy option, Ed25519 for QR, PIN profile login). Append-only.
   - docs/PROGRESS.md: checklist of prompts 1 to 10 with status and the date done.
   - docs/DEMO.md: placeholder for the live demo script, filled in prompt 10.
   - Add a root CLAUDE.md that says: read docs/ first, follow prompts.md ground rules, update docs/ at the end of every task.

3. Backend auth (apps/api):
   - SQLite schema and migration for departments, users (id, name, title, department_id, pin_hash) and user_roles (user_id, role, department_id).
   - Seed script with the six seed people from prompts.md, all in CSE, PIN 1234 for everyone (bcrypt-hashed).
   - GET /api/profiles (public: id, name, title, primary role, initials; no PINs), POST /api/auth/login {userId, pin} → JWT {sub, roles}, GET /api/me.
   - Middleware requireAuth and requireRole(...roles).

4. Frontend (apps/web), no tests:
   - Tailwind theme from the design tokens; Public Sans and IBM Plex Mono via Google Fonts.
   - Login screen: product name and the tagline "No queues. No paper. No forged signatures.", then a grid of profile cards (initials circle, name, role). Tap a card → a 4-digit PIN pad → in. Remember the last profile in localStorage.
   - After login, route by role to a home shell: Student → /student, Faculty coordinator/HoD/Dean SA → /inbox, Security → /gate, Admin → /admin. Each shell is a centred page with a single big placeholder CTA and a small "Switch profile" link at the top right. Public route /verify (no login).

5. Backend tests: login success, wrong PIN, role guard, profiles endpoint never leaks PIN hashes. Run `npm test` until green.

6. Update docs/PROGRESS.md, then commit "Foundation: monorepo, docs, profile login" and push.
```

## Prompt 2 · Core workflow backend: submit, route by role, sign

```
Read CLAUDE.md, docs/ and prompts.md. Build the full core approval engine in apps/api in one pass, then test it in bulk.

1. Schema and migration:
   - request_types (code, name, fields_json) and route_steps (request_type, step_no, role, parallel_group, affected_by_json). Seed:
     event_permission: step 1 Faculty coordinator; step 2 HoD and Security in parallel; step 3 Dean SA.
       affected_by: Faculty coordinator = [date, venue, title, headcount]; HoD = [date, venue, title, headcount]; Security = [headcount]; Dean SA = [title, headcount]. (Date and venue changes must hit only Faculty coordinator and HoD; this is used in prompt 6.)
     on_duty: Faculty coordinator → HoD. bonafide: HoD → Dean SA.
     Event permission fields: title, date, venue, headcount, purpose.
   - requests (id like PLC-2026-0001, student_id, type, status, current_version, created_at, updated_at).
   - request_versions (request_id, version, form_json, created_at, reason).
   - approvals (request_id, version, step_no, role, assignee_id, decision pending|approved|rejected|returned|carried, comment, signed_at, signature).
   - audit_log (request_id, actor_id, action, version, details_json, at).

2. Routing engine (one module, pure functions where possible): on submit, resolve each role in the chain to a person via user_roles and the student's department, create pending approvals for the first step group only; when every approval in a group is approved, open the next group; when the last group finishes, status = approved. Reject ends the request. Return sends it back to the student with the comment; the student can edit and resubmit, which restarts the chain.

3. Signing: when an approver approves, the server signs a canonical JSON {requestId, version, role, approverId, decision, formHash, signedAt} with the Ed25519 issuer key (packages/shared holds canonical JSON + hash helpers) and stores the signature. Approve/reject/return require the approver's PIN in the body (the "one tap + PIN" sign-off).

4. Endpoints:
   - GET /api/request-types
   - POST /api/requests (student) · GET /api/requests/mine · GET /api/requests/:id (student owner, assigned approvers, admin) with a timeline: every step, who, decision, when, which version.
   - POST /api/requests/:id/resubmit (after return)
   - GET /api/inbox (approver: pending items assigned to me, oldest first) · POST /api/approvals/:id/decide {decision, comment, pin}
   - Every state change writes to audit_log.

5. Tests (Vitest + Supertest, one end-to-end file plus unit tests for the engine): Riya's event permission goes coordinator → HoD and Security in parallel → Dean SA → approved; Dean SA cannot act before step 2 completes; a reject stops the chain; return then resubmit restarts it; on_duty and bonafide chains; wrong PIN refuses; a student cannot read another student's request; audit rows exist for every action. Run `npm test` until green.

6. Update docs/ARCHITECTURE.md (state machine and tables), docs/PROGRESS.md, append to docs/DECISIONS.md. Commit "Core workflow: routing engine, approvals, audit" and push.
```

## Prompt 3 · Core workflow UI: student and approver

```
Read CLAUDE.md, docs/DESIGN.md and prompts.md. Build the student and approver screens against the prompt 2 API. Do not write UI tests and do not run the browser; I will test.

Every screen has exactly one primary CTA in the centre. Keep copy short.

1. Student home (/student): a large centred "New request" button. Below it, a short list of my requests as cards: title, type, a status pill, and a one-line "With: HoD (since 2 h)". Empty state: just the button and one line of help.

2. New request (/student/new): step 1, three big tiles (Event permission, On-duty, Bonafide). Step 2, a single-column form for that type with native date input; the bottom CTA is "Submit for approval". After submit, go straight to the request page.

3. Request page (/requests/:id): the horizontal step track from deck slide 4, as vertical on mobile (hollow accent ring = pending, filled green tick = approved, red = rejected, amber = returned; parallel steps sit side by side). Each step shows the person, role and time. If returned, the central CTA is "Edit and resubmit" with the approver's comment above it. If approved/sealed, the CTA is "Download PDF" (wired in prompt 4; keep it disabled until then).

4. Approver inbox (/inbox): "Review next (n)" is the central CTA. It opens one request at a time as the phone card from deck slide 7: type label in mono caps, title, student and department, the form fields in two columns, then green "Approve" (primary) and outlined "Return" and a text-only "Reject". Approve/Return/Reject open a bottom sheet with an optional comment and the 4-digit PIN pad. After a decision, slide to the next item automatically; at zero, show "All clear" with a green tick.

5. Shared: an api client with the JWT, a status-pill component, a timeline component reused later for versions, a toast for errors. No state library; React state and fetch are enough.

6. Update docs/DESIGN.md with the screen list and CTA per screen, docs/PROGRESS.md. Run the backend tests to make sure nothing broke, then commit "Core UI: student submit and track, approver inbox" and push.
```

## Prompt 4 · Seal: PDF, SHA-256, blockchain anchor, signed QR

```
Read CLAUDE.md, docs/ and prompts.md. Build the trust layer in bulk, then test it.

1. Contract (contracts/): Solidity DocumentRegistry, owner-only writes.
   - struct Record { bytes32 requestId; uint32 version; bytes32 prevHash; bytes32 rolesHash; uint64 sealedAt; uint64 validFrom; uint64 validUntil; uint8 status; } status: 1 Active, 2 Superseded, 3 Revoked.
   - seal(docHash, requestId, version, prevHash, rolesHash, validFrom, validUntil): rejects a duplicate hash; if prevHash is non-zero it must exist and be Active, and it is marked Superseded with a link to the new hash (supersededBy mapping).
   - revoke(docHash, reasonCode), get(docHash), latestFor(requestId).
   - Events: Sealed, Superseded, Revoked. No personal data in any argument.
   - Hardhat tests for every rule. Deploy script writes the address to contracts/deployments/<network>.json.
   (Versioning and revocation are used in prompts 7 and 8, but the contract ships complete now so it is deployed once.)

2. Chain service (apps/api/src/chain.ts): CHAIN_MODE=local talks to a Hardhat node started by `npm run dev` (auto-deploys if no deployment file); CHAIN_MODE=amoy uses AMOY_RPC_URL and AMOY_PRIVATE_KEY and returns a Polygonscan Amoy tx link. On RPC failure, queue the anchor in a pending_anchors table and retry on an interval ("queue-and-retry anchoring" from the deck's risk register); status shows "Sealing…" until it lands.

3. Sealing pipeline, run automatically when a request reaches approved:
   - Build the PDF with pdf-lib: header "CampusSign" + request type, request ID in mono, version "v1", the form fields, a signature block listing each role, person, decision time and a short signature fingerprint, and a QR code in the corner. Fonts and colours follow docs/DESIGN.md.
   - QR content: `${PUBLIC_BASE_URL}/verify#p=<payload>` where payload = base64url(compact JSON of {rid, v, type, title, student name, dept, date, venue, validFrom, validUntil, iat}) + "." + base64url(Ed25519 signature). validFrom/validUntil = the event date 00:00 to 23:59 Asia/Kolkata for event permission; issue date + 1 year for other types. Put encode/decode/verify in packages/shared so the browser uses the same code.
   - Hash (decided, no alternatives): the QR identifies the approval by (rid, v) and is protected by its own signature, so it does not contain the file hash (a file cannot contain its own hash). Render the PDF with the QR, then anchor SHA-256 of the final bytes. Uploading a file → hash → chain lookup catches any one-byte edit. Scanning a QR → signature check, then (online) lookup by (rid, v) → live status. Record this in docs/DECISIONS.md.
   - Save the PDF to apps/api/storage/, record the hash, tx hash and status sealed.

4. Endpoints: GET /api/requests/:id/pdf (owner, approvers, admin), GET /api/issuer-public-key (public), GET /api/verify/hash/:hash and GET /api/verify/ref/:rid/:v (public, same response: status, version, type, sealedAt, validity, signer roles, supersededBy, tx link; no personal data).

5. Wire the student "Download PDF" CTA and add a small "Sealed on chain" green badge with the tx link on the request page.

6. Tests: full Riya flow ends sealed with a record on the local chain; PDF hash matches the chain; one flipped byte gives a different hash; QR payload round-trips and verifies with the public key; a tampered payload fails signature check; anchoring retries after a simulated RPC failure. Run `npm test` (API + contract) until green.

7. Update docs/TRUST.md (new: what is signed, what is hashed, what is on chain, QR format), docs/DECISIONS.md, docs/PROGRESS.md. Commit "Seal: PDF, SHA-256, DocumentRegistry anchor, signed QR" and push.
```

## Prompt 5 · Verify page: scan or upload

```
Read CLAUDE.md, docs/TRUST.md and docs/DESIGN.md. Build the public verify page. No UI tests; I will test.

1. /verify, no login. Central CTA: "Scan QR". Secondary: "Upload PDF".
   - Scan: camera QR reader (a small library such as @zxing/browser or html5-qrcode). Opening a /verify#p=... link counts as a scan.
   - For a QR payload: verify the Ed25519 signature locally with the issuer public key, then (when online) call /api/verify/ref/:rid/:v for live status.
   - Upload: hash the PDF in the browser with WebCrypto SHA-256, call /api/verify/hash/:hash.

2. One full-screen result, nothing else on screen:
   - Verified: green tick, "Verified", type, title, version, signed by roles with times, sealed date, "View on chain" link.
   - Tampered / Not found: red cross, "Tampered: this file does not match any sealed record".
   - Keep two more result states ready for later prompts: "Superseded by vN" (amber) and "Revoked" (red). The page must never show "Verified" unless the live status is Active (or, offline, see prompt 9).
   - Footer line: "Hash only, no personal data on chain."

3. Backend: GET /api/verify/hash/:hash already exists; add a rate limit and tests that it returns the right status for active, unknown and tampered hashes. Run `npm test` until green.

4. Update docs/PROGRESS.md and docs/DEMO.md (verify steps). Commit "Verify page: scan and upload" and push.
```

## Prompt 6 · Twist 1: amendment flow with selective re-approval

```
Read CLAUDE.md and docs/CONTEXT.md (twist section). Requirement: two days after Riya's event permission is sealed, the date and venue change. She amends the sealed approval instead of submitting a new request; only affected approvers re-approve. A date or venue change goes back to Faculty coordinator and HoD and skips Security and Dean SA. Build backend in bulk, test in bulk.

1. POST /api/requests/:id/amend (student owner, status sealed only) {changes: {date?, venue?, ...}, reason}. It:
   - creates request_versions row v(n+1) with the merged form and the reason, and status = amending; v(n) stays sealed and valid until v(n+1) is sealed.
   - diffs old vs new fields and computes affected roles = union of route_steps.affected_by that include any changed field. For date/venue that must be exactly {Faculty coordinator, HoD}.
   - creates pending approvals for affected roles only, in chain order (keep the parallel-group rules among the affected ones); for every unaffected role, inserts an approval row with decision "carried", pointing at the approval from the previous version it carries, so history shows exactly who approved which version.
   - rejects amendments that change nothing, or change fields that are not amendable.
2. A return or reject during amendment ends the amendment only: the previous version stays sealed and valid; the student sees the comment.
3. When all affected approvals are done, run the sealing pipeline as v(n+1) (prompt 7 links it on chain).
4. Audit every step with the version number.
5. UI (no tests): on a sealed request page the central CTA becomes "Amend" (secondary to "Download PDF" only when the event date has not passed). The amend form shows only the fields, pre-filled, with the changed ones highlighted, a reason box, and before submit a one-line preview: "Goes back to: Faculty coordinator, HoD. Kept: Security, Dean SA." The approver card shows a "Changed" diff (old struck through, new in bold) for amended requests.
6. Tests: date+venue change routes to coordinator and HoD only; Security and Dean SA get "carried" rows linked to their v1 approvals; headcount change also routes to Security and Dean SA; no-op amendment refused; amend on a non-sealed request refused; a return during amendment leaves v1 sealed and valid; the original submit flow tests from prompt 2 still pass. Run `npm test` until green.
7. Update docs/CONTEXT.md (affected-by table), docs/DECISIONS.md, docs/PROGRESS.md. Commit "Twist: amendment with selective re-approval" and push.
```

## Prompt 7 · Twist 2: versioned sealing v1 → v2 on chain

```
Read CLAUDE.md and docs/TRUST.md. Requirement: seal the amended document as v2, link it on chain to v1, and keep a traceable history of who approved what and which version they approved.

1. Sealing pipeline for v(n+1): PDF shows "v2 · amends v1 (<v1 short hash>)", the reason, and a signature block where each line says the role, person, decision and the version they approved (e.g. "Security · Mr. Pawar · approved v1, carried to v2"). QR payload carries v (prev version is resolved on chain).
2. Anchor with DocumentRegistry.seal(..., prevHash = v1 hash): the contract marks v1 Superseded and records supersededBy[v1] = v2. Store the tx for both versions.
3. GET /api/requests/:id/history: every version with hash, tx link, sealed time, status, reason, and the per-role approvals with the version each was given on. GET /api/verify/hash/:hash for a superseded hash returns status superseded and the latest version and its hash.
4. UI (no tests): the request page gets a compact version strip "v1 Superseded → v2 Active" using the timeline component; tapping a version shows its approvals. Verify page shows "Superseded by v2" (amber) for a v1 file or v1 QR, with a button "Check v2".
5. Tests: full scenario submit → seal v1 → amend date+venue → coordinator and HoD approve → v2 sealed; chain has v1 Superseded and linked to v2; verifying v1's file says superseded, never verified; history lists Security and Dean SA as approved on v1 and carried to v2, coordinator and HoD as approved on both; an attempt to seal with a prevHash that is not Active fails. Run `npm test` until green.
6. Update docs/TRUST.md (version chain), docs/PROGRESS.md. Commit "Twist: versioned sealing linked on chain" and push.
```

## Prompt 8 · Twist 3: revocation

```
Read CLAUDE.md and docs/TRUST.md. Requirement: the HoD or Dean SA can revoke an approval entirely. Scanning an outdated or cancelled PDF must show "Superseded by v2" or "Revoked", never "Verified".

1. POST /api/requests/:id/revoke (HoD or Dean SA of that department only) {reason, pin}: calls DocumentRegistry.revoke on the latest active hash, sets request status revoked, signs a revocation record with the issuer key, writes audit. Revoking the latest version revokes the request; older superseded versions keep showing Superseded, and verifying any version of a revoked request reports Revoked first.
2. Revocation list for offline use (consumed in prompt 9): GET /api/revocations returns {issuedAt, entries: [{rid, v, hash, status: revoked|superseded, at}]} signed with the issuer key as one payload. Include superseded versions too, so an old v1 QR is caught offline.
3. Verify precedence everywhere (API and page): Revoked > Superseded > outside validity window > Verified. Write this as one shared function in packages/shared and use it in both places.
4. UI (no tests): for HoD and Dean SA, a sealed request page has a text-red "Revoke approval" link (not a primary CTA), which opens the confirm sheet with a reason and PIN. The student sees a red "Revoked by <role> on <date>: <reason>" banner and the Amend CTA disappears. Verify page shows the full-screen red "Revoked" state with role, date and reason code.
5. Tests: HoD revoke works; Dean SA revoke works; coordinator, Security and student cannot; revoked hash verifies as revoked on API and chain; v1 of a revoked request shows revoked; revocation list signature verifies and contains revoked and superseded entries; precedence function unit tests for every combination. Run `npm test` until green.
6. Update docs/TRUST.md, docs/PROGRESS.md. Commit "Twist: revocation with signed revocation list" and push.
```

## Prompt 9 · Twist 4: offline gate check

```
Read CLAUDE.md and docs/TRUST.md. Requirement: the Security guard verifies the QR completely offline on event day. The QR holds the essential approval details and a digital signature that the page validates locally. The approval is valid only on the event date. Explain how revocations after QR issuance are handled when the guard's device has no internet.

1. Gate app (/gate, Security profile) as an installable PWA: a service worker caches the app shell, the QR scanner, the issuer public key and the latest revocation list, so the page loads and works in airplane mode after one online visit.
2. Central CTA: "Scan pass". Result in under a second, full screen, readable at arm's length:
   - VALID (green): event title, student name, department, venue, date, version, and "Offline check" or "Online check".
   - NOT TODAY (amber): signature fine, but now is outside validFrom..validUntil (show the valid date).
   - SUPERSEDED (amber) / REVOKED (red): from the cached revocation list (or live status if online).
   - INVALID (red): bad signature or unreadable payload.
   Logic: decode → verify Ed25519 signature with the cached public key → check the validity window against the device clock → check the cached revocation list → if online, also query /api/verify/ref/:rid/:v and let the live answer win. Use the shared precedence function from prompt 8.
3. Freshness: the top bar shows "Revocation list synced 08:02 · 3 entries". "Sync now" refreshes it when online; it also auto-syncs on load and every 5 minutes while online. If the list is older than a threshold (default 12 h) or was synced before today, every VALID result shows an amber note "List not synced today".
4. Explain offline revocation in docs/OFFLINE_GATE.md and in an "How offline checks work" sheet linked from /gate, in plain words:
   - A guard device cannot learn about a revocation it has not received. We shrink that gap three ways: (a) the pass is only valid on the event date, so an old or stolen pass is useless on any other day; (b) the guard syncs the signed revocation list at shift start, and amendments and revocations are pushed into it immediately, so anything revoked before sync is caught offline; (c) the list carries its own issue time, so the guard sees exactly how fresh it is and is told when it is stale.
   - The remaining window is "revoked after the guard's last sync and before the scan". The procedure for it: the HoD or Dean who revokes also tells Security (we show a "Notify gate" reminder after revoke), and any amber freshness warning means the guard asks for the latest pass or checks online when signal returns.
   - Amendments: an amended v2 automatically supersedes v1; v1 appears in the list, and v1's QR also carries the old date, so it fails the date window offline even without a sync.
5. Backend tests: QR payload validation in packages/shared under a fake clock (event day valid, day before and after not today), revoked and superseded payloads rejected using a signed list, a list with a bad signature is ignored, live status overrides cached. Run `npm test` until green. No UI tests.
6. Update docs/OFFLINE_GATE.md, docs/PROGRESS.md. Commit "Twist: offline gate check PWA with signed revocation list" and push.
```

## Prompt 10 · Demo hardening, regression and release

```
Read CLAUDE.md and all of docs/. Make the whole product demo-ready and prove the original workflow still works next to the twist.

1. One end-to-end API test file that runs the full live-demo script in order:
   a. Riya submits event permission (Robotics fest, Hall B, 5 Nov, 120).
   b. Coordinator approves; HoD and Security approve in parallel; Dean SA approves; v1 sealed on chain; verify v1 file and QR: Verified.
   c. Riya amends date and venue; only coordinator and HoD get it; Security and Dean SA carried.
   d. v2 sealed and linked to v1; verify v1: Superseded by v2; verify v2: Verified; history shows who approved which version.
   e. Gate check on the new event date with a fake clock: v2 VALID offline; v1 SUPERSEDED offline via the list and NOT TODAY by date.
   f. HoD revokes; verify v2: Revoked; gate with a synced list: REVOKED; gate with a stale list: valid but flagged stale (documents the known offline gap).
   g. A one-byte-edited PDF: Tampered.
   h. On-duty and bonafide still flow submit → approve → seal → verify.
   Fix anything that fails. `npm test` must be fully green.
2. Demo tooling: `npm run seed:demo` resets the database and chain and pre-loads one sealed v1 for Riya so the amend step can start immediately; an Admin-only "Reset demo" button on /admin calls the same thing. Admin home also lists every request with status and a link, which is the only admin feature.
3. Production run: `npm run build && npm start` serves the API and the built web app from one port. PUBLIC_BASE_URL is used in QR codes so phones scanning on the same Wi-Fi reach the verify page. Document how to switch to CHAIN_MODE=amoy.
4. docs/DEMO.md: the exact click-by-click live script for steps a to g with which profile to use, what to say in one line per step, and the fallback if the network drops (local chain, offline gate). README.md: what it is, how to run, how to test, links into docs/.
5. Final pass: remove dead code and unused dependencies, check no personal data is passed to the contract, check product copy never says "Verified" for a non-active record. Update docs/PROGRESS.md to all done. Commit "Demo-ready: full regression, demo script, docs" and push.
```

---

## Prompt 11 · Open sign-up, student workspace, collaborators, send to anyone

```
Read CLAUDE.md and docs/. The live demo starts from zero: people sign up on the spot, then use the product. Make identity
dynamic and give students a workspace. Keep every existing flow (submit → route → sign → seal → verify, the twist, operations)
working and tested.

1. Sign up / log in (one page, two choices: "Student" or "Staff / Administrator")
   - Student sign-up: name, email, password, 4-digit signing PIN, department. Optional: roll number, year.
   - Staff sign-up: name, email, password, 4-digit signing PIN, department, designation (Faculty, Faculty coordinator,
     HoD, Dean Student Affairs, Security, Librarian, Lab in-charge, Hostel warden, Accounts office, Registrar / Admin).
     Optional: title (e.g. Associate Professor), employee ID, phone, short bio.
   - Log in: email + password. Designation decides the home: approvers → inbox, Security → gate, Registrar → admin,
     students → their workspace. Unique emails; bcrypt passwords; sign-up and log-in rate limited.
   - Profile page to edit the optional details later. Demo accounts stay (email + password demo1234); the old
     profile picker is removed from the page. Departments are a seeded list (public endpoint).
   - Routing must work for brand-new accounts: a role resolves to the holder the student is connected with, else the
     most recently joined holder in the student's department.

2. Student workspace (dashboard)
   - Sidebar "My documents": drag-and-drop zone (and click to pick) for PDF/PNG/JPG, list with select and delete.
     Documents are a reusable library: attaching one to a request copies a reference, the library keeps it.
   - "My teachers": a block per connected staff member (name, designation, department) with a clear "Send document"
     CTA; pending connection requests show as "Waiting for <name>".
   - "Add a teacher": search staff by name, designation or department; results as blocks with "Add" (sends a
     connection request). Staff see connection requests in their inbox and Accept / Decline; the student is emailed.
   - "Waiting for your signature": documents other students sent me, with a Review CTA.
   - The existing "New request" (forms) and "My requests" stay.

3. Send a document to anyone
   - From a teacher block, from selected sidebar documents, or a "Send document" button: pick the recipient from
     everyone (tabs All · Staff · Students, search), pick documents from the library (at least one), a title
     (e.g. "Letter of recommendation") and an optional note. Sending does not require a connection.
   - New request type "Document for signature": a single step held by the chosen recipient (role "Recipient"),
     signed with their PIN, then sealed, anchored and verifiable like every other request. Students who receive
     documents get an inbox entry and sign the same way.

4. Tests in bulk: sign-up validation, duplicate email, login, profile edit, routing to new/connected holders,
   connections (request, accept, decline, permissions, search), document library (upload, reuse, delete), direct send to
   staff and to a student through seal and verify. Update docs (CONTEXT, ARCHITECTURE, DESIGN, DECISIONS, PROGRESS, DEMO,
   COMPLIANCE). Commit and push.
```
