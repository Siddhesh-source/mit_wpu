# Progress

| # | Prompt | Status | Date |
| --- | --- | --- | --- |
| 1 | Foundation, docs, profile login | Done | 2026-10-21 |
| 2 | Core workflow backend | Done | 2026-10-21 |
| 3 | Core workflow UI | Done | 2026-10-21 |
| 4 | Seal: PDF, SHA-256, chain, signed QR | Done | 2026-10-21 |
| 5 | Verify page | Done | 2026-10-21 |
| 6 | Twist: amendment | Done | 2026-10-21 |
| 7 | Twist: versioned sealing | Done | 2026-10-21 |
| 8 | Twist: revocation | Done | 2026-10-21 |
| 9 | Twist: offline gate check | Done | 2026-10-21 |
| 10 | Demo hardening and release | Done | 2026-10-21 |
| 11 | Open sign-up, student workspace, collaborators, send to anyone | Done | 2026-10-21 |

## Notes

- Prompt 1: 6 API tests (profiles, login, wrong PIN, role guard, no PIN leak). Role homes are placeholder shells with a disabled central CTA. Pushing needs write access to `Siddhesh-source/mit_wpu`.
- Prompt 2: routing engine, signing, audit; 19 API tests green (13 workflow + 6 auth). Catalogue in `apps/api/src/catalog.ts`.
- Prompt 3: student submit/track, approver inbox with PIN sheet, live refresh. UI not tested by Claude (user tests). Backend still 19/19.
- After prompt 3: desktop layout (two-column request/review, 3-across picker, centred PIN dialog), readable dates, "Stopped" for cancelled steps, sign-out-on-network-error fix. Verified with Playwright screenshots at 390px and 1440px.
- Prompt 4: DocumentRegistry (8 contract tests), sealing pipeline, PDF with signed QR (decodes from the rendered page), queue-and-retry, chain-restart replay, per-DB contract. 29 API tests. UI: Download PDF + "Sealed on chain" badge.
- Prompt 5: verify page (scan / upload / photo / link), rate-limited verify API; 31 API tests.
- Prompt 6: amend endpoint with selective re-approval and carried approvals, return-during-amendment, v2 sealed and linked on chain; amend UI + diffs. 39 API tests.
- Prompts 7 + 8: version history API + strip, revoke (HoD/Dean, queued, replayed), signed revocation list, shared verdict precedence; 61 API tests + 8 contract tests.
- Prompt 9: gateCheck (7 fake-clock tests incl. the known gap), gate PWA with sync bar and help sheet, offline session, HTTPS dev mode. 68 API tests.
- Prompt 10: demo e2e test (a–h + no personal data on chain), seed:demo + Admin reset/list, single-port production, security headers, DEMO.md, README. Offline gate verified in a headless browser against the production build (reload and scan with network off). 72 API tests.
- Wrap-up: PIN rate limit, AWS free-tier deployment (`deploy/` + `docs/DEPLOY_AWS.md`), requirements audit (`docs/COMPLIANCE.md`). Final: 73 API tests + 8 contract tests green, all workspaces type-check, production build verified (single port, demo seed, queued anchoring, offline gate).
- High-priority additions: attachments, no-dues (parallel), SLA reminders + escalation, delegation, batch approve, college ID on chain, impact dashboard, audit log viewer, email outbox with AWS SES ready (`docs/EMAIL_SES.md`). 88 API tests + 8 contract tests.
- Return / reopen / discuss: selective resubmission, reopen of rejected requests, discussion thread with emails. 93 API tests + 8 contract tests.
- Prompt 11: open sign-up / log in (student, staff / administrator), profile, live routing, teachers (search, connect, accept), document library with drag and drop, send to anyone (staff or student). 102 API tests + 8 contract tests. Live flow (sign up both sides → connect → accept → drop file → send → sign → sealed) verified headlessly on the production build.
- Light / dark mode toggle on every screen (saved per device, follows the device until chosen). Checked rendered in both themes.
- Deployed to AWS (2026-10-21): t4g.micro `i-0f226b2f18ae18e70` in ap-south-1, Elastic IP 13.205.194.159, https://campussign.duckdns.org, local chain, email via SES (sandbox, sender and redirect `csiddhesh3011@gmail.com`). Details and teardown: `docs/DEPLOY_AWS.md` → "Live deployment".
- Renamed to CampusSign everywhere user-facing (2026-10-21); live site moved to https://campussign.duckdns.org and redeployed. The demo was reseeded so its QR links use the new hostname.
- Dashboards (2026-10-21): role-aware top bar; staff dashboard (stats, waiting list with pick-any review, recent decisions, delegate, students, quick links), History page with filters/search/CSV, student home stats + Needs your action + filtered requests, admin overview tiles + search. New `GET /api/dashboard`. 104 API tests + 8 contract tests; tests now run on Windows.
- People, classes, custom requests (2026-10-21): staff **People** page in the top bar (Classes · Students · Colleagues); classes with a 6-letter code emailed to invited students' registered addresses, joinable only by them (joining connects student and teacher); students join from "My classes". **Custom request**: the student writes the title and details and picks the signers by designation, in order. Wording: "Signed" instead of "Sealed" and "Reminder sent" instead of "Overdue" everywhere users see it. Verify page now sits inside the app (top bar) when signed in. 107 API tests + 8 contract tests.
- My teachers (2026-10-21): student top bar Home · New request · My teachers · To sign · Verify (Send a document removed from the bar). New `/student/teachers` page with Teachers and Classes tabs (add a teacher, join with code); the student home shows a summary card. 107 API tests + 8 contract tests.
- Design audit and fixes (2026-10-21): `docs/DESIGN_AUDIT.md` (C+ → B+, AI slop C → B+). Icon set, stat strip, dashboard and student home relaid, request page actions, request-type list, form labels, focus ring, phone header. Verified with screenshots on a local seeded copy (desktop and phone, light and dark).
- New logo (2026-10-21): signature-to-check mark and two-tone wordmark in the top bar, sign-in and verify; new favicon / home-screen icon.
- Sign in place (2026-10-21, `docs/SIGN_IN_PLACE.md`): stored signatures (draw, type, upload) on the dashboard and profile; send any PDF to people in order, each "signs as" a label, with signature boxes placed on the pages (drag, resize, Find sign spots reads the form); the reviewer sees their boxes and cannot approve without a saved signature; the captured signature is stamped into the boxes with a caption, a footer on every page and a certificate page appended; VIT form templates (FF No. 180, leave / on duty, internship NOC, industrial visit) with spots pre-placed. AIDS department with Prof. Dr. Minal Barhate (guide) and Dr. Shital Parag Dongre (HoD). 111 API tests + 8 contract tests.
- Send page fix (2026-10-21): the Send button sat at the bottom of a sticky side column taller than the screen, so it was out of reach; it is now a send bar fixed to the bottom of the screen. Signer slots suggest the matching faculty in one tap; empty slots (e.g. Project Coordinator) no longer block sending.
