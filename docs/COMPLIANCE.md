# Requirements check

Audit of the build against `prompts.md`, the product context (`docs/CONTEXT.md`, the deck and overview) and the "Plan Changed" requirements. Evidence = where it is implemented and the test that proves it. Last full run: **88 API tests + 8 contract tests, all green**; web build clean; type checks clean in every workspace; offline gate verified in a headless browser against the production build.

## "The Plan Changed" requirements

| Requirement | Status | Implementation | Proof |
| --- | --- | --- | --- |
| Amend a sealed approval instead of a new request | Done | `amendRequest` (`apps/api/src/workflow.ts`), `POST /api/requests/:id/amend`, `pages/AmendPage.tsx` | `amend.test.ts` |
| Only affected approvers re-approve; date/venue → Faculty coordinator + HoD, skipping Security and Dean | Done | `affectedBy` per step (`catalog.ts`); unaffected roles get `carried` rows | `amend.test.ts` "date + venue…", `workflow.test.ts` catalogue |
| Seal the amendment as v2, linked on chain to v1 | Done | `sealRequest` with `prevHash`; `DocumentRegistry.seal` marks v1 Superseded, `supersededBy[v1] = v2` | `amend.test.ts`, `history.test.ts`, `registry.test.ts` |
| Traceable history of who approved what, on which version | Done | `GET /api/requests/:id/history`, `VersionStrip`, PDF signer lines ("approved v1, carried to v2"), audit log with version | `history.test.ts`, `demo.e2e.test.ts` (d) |
| HoD or Dean can revoke entirely | Done | `revokeRequest` (`seal.ts`), `POST /api/requests/:id/revoke`, red link + PIN sheet | `revoke.test.ts` |
| Outdated / cancelled PDF shows "Superseded by v2" / "Revoked", never "Verified" | Done | `verdictFor` precedence; verify page verdicts; no "Verified" stamp printed on PDFs | `revoke.test.ts`, `amend.test.ts`, `seal.test.ts` (pending ≠ verified) |
| Security verifies the QR completely offline | Done | `gateCheck` (`packages/shared/src/gate.ts`), gate PWA (`pages/Gate.tsx`, `public/sw.js`) | `gate.test.ts`; headless offline reload + scan (PROGRESS) |
| QR holds essential details + a digital signature validated locally | Done | Pass `{rid, v, t, ti, n, d, dt, ve, vf, vu, iat}` + Ed25519 (`packages/shared/src/pass.ts`) | `seal.test.ts` QR pass, `gate.test.ts` forged pass |
| Validity window restricted to the event date | Done | `validityFor`: 00:00:00–23:59:59 IST on the event date | `gate.test.ts` window edges |
| Explain revocations after QR issuance with no internet | Done | `docs/OFFLINE_GATE.md`, in-app "How offline checks work", signed revocation list + freshness bar | `gate.test.ts` "the known gap" |
| Original submit → route by role → sign → seal → verify keeps working | Done | Unchanged core; amendment reuses it | `workflow.test.ts`, `demo.e2e.test.ts` (b, h) |

## Prompt by prompt

| # | Requirement (from `prompts.md`) | Status | Notes |
| --- | --- | --- | --- |
| 1 | Monorepo, scripts, `.env.example` | Done | Root scripts `dev`, `test`, `build`, `seed`, plus `start`, `start:local`, `seed:demo` |
| 1 | `/docs` memory files + `CLAUDE.md` | Done | CONTEXT, ARCHITECTURE, DESIGN, DECISIONS, PROGRESS, DEMO, TRUST, OFFLINE_GATE, DEPLOY_AWS, COMPLIANCE |
| 1 | Profile login: cards → 4-digit PIN → JWT; role homes; remember last profile | Done | `auth.test.ts` |
| 2 | Catalogue, role chains with parallel step, `affected_by` | Done | Parallel = same `step_no` (equivalent to a `parallel_group` column) |
| 2 | Routing engine, approve / reject / return / resubmit, Ed25519-signed decisions with PIN, audit log | Done | `workflow.test.ts` (13) |
| 3 | Student home, new request, request page, approver inbox (one at a time, PIN sheet, auto-advance, All clear) | Done | No UI tests by design |
| 3 | "Horizontal step track (slide 4), vertical on mobile" | **Changed** | Vertical role chain (slide 7 style) on every size; desktop shows it in a side panel. Parallel steps read clearer side by side in a vertical chain |
| 4 | `DocumentRegistry` with seal / supersede / revoke, owner-only, no personal data | Done | `registry.test.ts` (8); calldata scanned for names in `demo.e2e.test.ts` |
| 4 | "Hardhat tests"; "deploy script writes `contracts/deployments/<network>.json`" | **Changed** | Contract tests run with Vitest + ethers against a real Hardhat node; the address is stored per database (`kv`), so a fresh database gets a fresh contract (DECISIONS 19–20) |
| 4 | Chain modes local / Amoy, Polygonscan link, queue-and-retry | Done | Plus contract-code check, redeploy + replay after a chain restart (`seal.test.ts`) |
| 4 | Sealed PDF + QR, SHA-256 of the final file, PDF download, "Sealed on chain" badge | Done | QR decodes from the rendered PDF (checked); PDF uses Helvetica/Courier instead of Public Sans (DECISIONS 24) |
| 5 | Public verify page: scan, upload, link; one full-screen result; footer | Done | jsQR instead of zxing/html5-qrcode; adds "Scan from photo" for plain-http phones |
| 5 | Verify API rate limit | Done | `verify.test.ts` |
| 6 | Amendment flow, diffs for approvers, return during amendment keeps v1 | Done | `amend.test.ts` (8) |
| 7 | v2 PDF ("amends v1"), history API, version strip, "Superseded by v2" + Check v2 | Done | `history.test.ts` (4) |
| 8 | Revoke (HoD/Dean only), signed revocation list incl. superseded, shared precedence function | Done | `revoke.test.ts` (18 incl. precedence table) |
| 9 | Gate PWA, offline signature + window + cached list, live wins, sync bar, stale warning, explanation | Done | `gate.test.ts` (7); offline run in a real browser |
| 10 | End-to-end demo test a–h | Done | `demo.e2e.test.ts` |
| 10 | `seed:demo`, Admin reset + request list | Done | Seed dates v1 a week ahead so the live amendment to today shows VALID at the gate |
| 10 | One-port production run, `PUBLIC_BASE_URL`, Amoy switch documented | Done | `npm run build && npm start`; `docs/DEPLOY_AWS.md`, `docs/TRUST.md` |
| 10 | DEMO.md, README, final cleanup, no personal data on chain, never "Verified" for a non-active record | Done | Unused placeholder page and export removed |

## Ground rules

| Rule | Status |
| --- | --- |
| Core v1 only: no AI/LLM, DigiLocker, Aadhaar, notifications, SLA escalation, delegation, form builder, analytics | Kept. None of these exist in the code |
| One central CTA per screen; mobile-first | Kept; desktop layout added on request |
| No UI tests; user tests the UI | Kept. Browser runs were limited to screenshots the user asked for and one offline-behaviour check of the gate |
| Backend built in bulk, tested, pushed only when green | Kept for every prompt |
| `/docs` updated at the end of every prompt | Kept (PROGRESS has one line per prompt) |
| No mention of the competition or evaluation in code, UI or docs | Kept (checked with a repository search; only the rule text itself mentions it) |

## Alignment with the product context

| Context (deck / overview) | Build |
| --- | --- |
| Roles, not names; resolved per department | `resolveRole` by department |
| Event permission: coordinator → HoD ‖ Security → Dean SA | Same chain, Security in parallel with HoD |
| One-tap signing (OTP / Aadhaar eSign) | One tap + 4-digit PIN (Aadhaar out of scope for v1) |
| SHA-256 of the signed PDF on chain; QR to a verify page | Same; Polygon Amoy or a local chain |
| On chain: hash, request ID, type, signer roles, timestamps; never personal data | Same (roles + times as `rolesHash`); verified by a calldata scan |
| "Change one character and the proof breaks" | `seal.test.ts`, demo step F |
| Lifecycle Draft → Submitted → In review → Approved / Rejected / Returned → Sealed → Verified | Same, without a separate Draft state (a request exists from submit) |
| Supabase / n8n / Lovable stack | Replaced by one TypeScript app with SQLite for speed and offline demos; schema kept Postgres-compatible (DECISIONS 2) |

## High-priority additions (from the gap review against the overview and deck)

| Gap | Status | Implementation | Proof |
| --- | --- | --- | --- |
| Upload documents ("upload the document once") | Done | `attachments.ts`, `AttachmentPicker`; file hashes are inside the signed form hash and listed on the PDF | `operations.test.ts` attachments (3) |
| Deadlines, nudge, auto-escalation (slide 7 "SLA 48 h", "Missed SLA? Auto-escalates") | Done | `runSla` (`ops.ts`), Overdue / Escalated in timeline and inbox | `operations.test.ts` deadlines (2) |
| Delegation while away (slide 7 "On leave? Goes to the delegate") | Done | `createDelegation`, on-behalf signing, inbox sheet | `operations.test.ts` delegation (2) |
| No-dues clearance with parallel approvers | Done | catalogue entry + 4 seeded roles | `operations.test.ts` no-dues |
| Batch approve ("approve 20 requests in minutes") | Done | `POST /api/approvals/batch`, inbox multi-select | `operations.test.ts` batch |
| Issuing college ID on chain | Done | contract `issuer`, QR `c`, PDF header | `registry.test.ts`, `operations.test.ts` college id |
| Impact dashboard (turnaround, bottlenecks, paper, CO2e) | Done | `stats` + `ImpactDashboard` | `operations.test.ts` stats |
| Audit log viewer | Done | `/api/admin/audit`, Admin → Audit log | `operations.test.ts` audit |
| Email notifications; AWS SES ready | Done | outbox + `log`/`ses` mailers, `docs/EMAIL_SES.md` | `operations.test.ts` email (3, SES request mocked) |

Not done here because they need the account owner: deploying to AWS and funding an Amoy wallet (`docs/DEPLOY_AWS.md`), verifying an SES sender and attaching the IAM role (`docs/EMAIL_SES.md`).

## Open items (outside v1 scope, by design)

- Real sign-in (college SSO/OTP), personal PINs, and staff import by CSV.
- The AI helpers and the no-code form builder from the deck; WhatsApp notifications.
- Data-protection pages (consent notice, retention, grievance contact).
- A batched Merkle-root anchoring mode for very high volume.
