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
