# Progress

| # | Prompt | Status | Date |
| --- | --- | --- | --- |
| 1 | Foundation, docs, profile login | Done | 2026-10-21 |
| 2 | Core workflow backend | Done | 2026-10-21 |
| 3 | Core workflow UI | Done | 2026-10-21 |
| 4 | Seal: PDF, SHA-256, chain, signed QR | Todo | |
| 5 | Verify page | Todo | |
| 6 | Twist: amendment | Todo | |
| 7 | Twist: versioned sealing | Todo | |
| 8 | Twist: revocation | Todo | |
| 9 | Twist: offline gate check | Todo | |
| 10 | Demo hardening and release | Todo | |

## Notes

- Prompt 1: 6 API tests (profiles, login, wrong PIN, role guard, no PIN leak). Role homes are placeholder shells with a disabled central CTA. Pushing needs write access to `Siddhesh-source/mit_wpu`.
- Prompt 2: routing engine, signing, audit; 19 API tests green (13 workflow + 6 auth). Catalogue in `apps/api/src/catalog.ts`.
- Prompt 3: student submit/track, approver inbox with PIN sheet, live refresh. UI not tested by Claude (user tests). Backend still 19/19.
- After prompt 3: desktop layout (two-column request/review, 3-across picker, centred PIN dialog), readable dates, "Stopped" for cancelled steps, sign-out-on-network-error fix. Verified with Playwright screenshots at 390px and 1440px.
