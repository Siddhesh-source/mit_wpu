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
50. **PIN attempts rate limited** (login, sign, revoke: 20 per IP per minute) so a 4-digit PIN cannot be brute-forced.
51. **AWS free tier = one EC2 instance + Caddy + SQLite**, no load balancer, RDS or NAT. t4g.small on post-July-2025 accounts, t3.micro + Amoy on legacy accounts; files in `deploy/`, guide in `docs/DEPLOY_AWS.md`.
52. **systemd runs the server through `tsx` directly** (no npm wrapper), memory-capped and sandboxed.
53. **Attachments are hashed into the signed form hash** (`{form, attachments: [sha256…]}`; unchanged hash when there are none), so approvers sign the files, not just the fields. Raw-body upload (no multipart dependency), magic-byte check, PDF/PNG/JPG only, 5 per request.
54. **Escalation notifies and flags; it does not reassign.** Re-routing work is the delegate's job; the next authority is told the step is stuck. Thresholds: SLA → reminder, 2 × SLA → escalation, once each.
55. **Delegation is explicit and dated** (no automatic "absent" detection). The delegate signs on behalf; `onBehalfOf` is inside the Ed25519-signed decision.
56. **Batch approve only approves**; return and reject always need a comment and are one at a time.
57. **Email via an outbox table** (same transaction as the event), delivered by a loop; `log` by default, AWS SES via `@aws-sdk/client-sesv2` with the instance role; `EMAIL_REDIRECT_ALL` for the SES sandbox. Revocations also email Security ("sync the gate list"), shrinking the offline gap.
58. **College ID is on chain (`issuer`), in the QR (`c`) and on the PDF**, as the overview's on-chain table requires; it is the hook for a multi-college network.
59. **Impact numbers use the overview's stated assumptions** (3 sheets/approval, 12.7 g CO2e/sheet, 8,333 sheets/tree, 0.4 L/sheet) and are labelled as estimates.
60. **Resubmission after a return is selective** (same `affectedBy` rule as amendments): the returner, anyone not yet approved, and affected earlier approvers review again; others are carried from their pre-return signature. Previously the whole chain restarted.
61. **Reject stays final unless reopened** by the rejecting approver, the HoD or the Dean SA; reopening turns it into a return (no new request, full history kept).
62. **Discussion is separate from decisions**: messages never approve, return or reject anything; they are audited ("commented") and emailed to the people who can act.
63. **Open sign-up with email + password; the signing PIN is chosen at sign-up.** Designation = role. Demo accounts keep working with `demo1234`; the id + PIN log in is test-only (`ALLOW_PIN_LOGIN`, off in production).
64. **Anyone may sign up as any designation, including Registrar / Admin**, because the live demo needs it. For a real deployment, senior designations should require approval by an existing admin (open item).
65. **Routing prefers the connected holder, then the newest holder** of the role in the student's department, so people who sign up live receive requests immediately without any setup.
66. **Documents are a reusable library**; attaching copies a reference (same stored file and hash) to the request. Deleting a library item never breaks a sent request.
67. **"Document for signature" is a normal request type with a `recipient` step**, so direct sends get the same signing, sealing, verification, discussion, deadlines and audit as every other request. Sending does not require a connection; connections only put teachers on the dashboard and steer routing.
68. **The people directory exposes name, designation, title and department only** (no email or phone).
69. **No hard-coded document titles.** "What is it?" is free text; the only suggestions are the student's own earlier titles (browser autocomplete).
70. **Light/dark switch for everyone, saved per device**, defaulting to the device setting. Colours are CSS-variable tokens, so every component follows the theme without per-component dark styles.
71. **Live deployment is one dedicated t4g.micro** (Arm, 1 GB + 2 GB swap, 12 GB gp3, local chain) in ap-south-1, not a co-host on another project's instance and not a t4g.small: the cheapest isolated option on the account's Free plan credits (~$9/month incl. the public IPv4). CPU credits are **standard** (never billed for bursts), IMDSv2 only, SSH only from the admin IP, and SES uses the instance role (no keys on disk). Elastic IP so QR links survive stop/start.
72. **Product renamed to CampusSign** in all copy (web app, manifest, PDF, emails, docs, deck source). Internal identifiers stay: request IDs `PLC-YYYY-NNNN` (already sealed on chain and printed in QRs), browser storage keys `plc.*` (keep sessions and the offline gate list), and the `paperless` service/user/paths on the server. Service worker cache bumped to `plc-shell-v2` so installed apps pick up the new name.
73. **Public hostname is `campussign.duckdns.org`**, set once to the Elastic IP; the DuckDNS token is not stored in the repo or on the server.
74. **Staff home is a dashboard, not an empty inbox.** `GET /api/dashboard` (staff and admin) returns waiting/overdue counts, decision totals, this week, average response (opened → signed), connected students, today's delegation and the decisions the person signed (carried approvals excluded). The central CTA stays Review next; everything else (queue, history, people, tools) sits around it. A role-aware top bar replaces back-and-forth links.
75. **Student home leads with what needs action** (returned requests) and filters My requests (In progress · Needs action · Sealed · Closed).
76. **Tests start Hardhat through Node** (`node .../hardhat/internal/cli/cli.js`) instead of the `.bin` shim, so `npm test` runs on Windows too.
77. **Classes are invite-only by registered email.** A teacher invites addresses; each must belong to a student account. The join code is emailed to that address and only works for an invited account, so a forwarded code is useless to anyone else. Joining also creates an accepted teacher connection, so the student's requests route to that teacher first.
78. **Custom requests choose designations, not people.** The student picks 1–6 designations in order; each resolves to a person exactly like the built-in chains (connected teacher first, then department holder, delegates honoured). The chain is stored per request (`request_routes`); any change sends it back to every signer. Built-in types keep their catalogue chains.
79. **User-facing wording: "Signed", never "Sealed"; "Reminder sent", never "Overdue".** Internal status values (`sealed`, `sealing`), database columns and the on-chain contract keep their names.
80. **Verify is part of the app when signed in** (same top bar); the public page keeps a light header with Sign in for anyone holding a document.
81. **New catalogue types reach existing databases on start** (`syncCatalog`, insert-only), so deploying never needs a demo reset.
82. **Students manage teachers and classes on their own page (My teachers), mirroring the staff People page.** The student home keeps a summary card (teachers, classes, join link); "Send a document" stays a home action and is reachable from every teacher block, but is not a top-bar item.
83. **Design audit (2026-10-21): app UI is calm and list-based, not card mosaics.** One line-icon set, a stat strip instead of stat cards, hairline-divided sections, one filled CTA per screen, no dead disabled buttons, global focus ring. Scores C+ → B+ (AI slop C → B+); details and remaining items in `docs/DESIGN_AUDIT.md`.
84. **Logo: a signature that becomes a check.** Chosen over a plain tick (generic) and squiggle-only marks (read as a line chart); legible at 16 px in light and dark. One drawing for header, sign-in, verify and favicon; service-worker cache bumped to `plc-shell-v3` so installed apps pick up the new icon.
85. **Sign in place uses the student's own PDF.** The signed copy is the original document page for page, signatures stamped into boxes placed by the student (fractions of the page, top-left origin), a one-line footer on every page and the certificate page appended; its SHA-256 is what goes on chain, so Verify works on the file people actually hold.
86. **Signers are named people, each with a "signs as" label;** their own designation becomes the step's role, so history, delegation and PDFs stay role-based. Two signers may not share a designation in one request.
87. **The signature used is captured at approval** (`approval_signatures`); changing a saved signature later never changes a signed document. Approving a step with boxes requires a saved signature.
88. **Find sign spots** reads the PDF's text in the browser (pdf.js) and maps signer labels to the form's own words ("Signature of Guide:", "Head of Department"); first match per label is placed, the rest offered. Templates we generate carry exact spots.
89. **pdf.js is loaded only on screens that show a PDF** (separate chunk and worker), keeping the main bundle unchanged.
90. **Filled real forms with personal data stay out of the repository and the server**; the FF 180 used for design is reproduced as a blank template.
91. **No stat banners on dashboards** (student, staff, registrar). The counts already appear where they lead to action: the Review next hero, the filter tabs, the top-bar badge and the People rows. The `StatStrip` component was removed.
92. **Sign in place is the core for any PDF, not a template feature.** Every request whose document is a PDF carries signing info; the signer list is the chain in order (parallel signers numbered separately, boxes keyed by step and role); an approver can place their own box when approving; the student gets one-click boxes for every signer (form's own spots, else a row at the foot of the last page).
93. **SSH is open to all addresses** (owner's request: the admin works from networks whose address keeps changing). Login is key-only (`PasswordAuthentication no`, `KbdInteractiveAuthentication no`), so an open port does not allow password guessing.
