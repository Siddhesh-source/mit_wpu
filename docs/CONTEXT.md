# Context

**PaperLess Campus** turns signature-chasing paper forms in an Indian university into role-routed digital approvals, signed in one tap and verifiable on a blockchain. Tagline: *No queues. No paper. No forged signatures.*

Sources of truth: `PaperLess Campus — Project Overview.md`, `PaperLess Campus — Pitch Deck Content (10 slides).md`, `out/deck.pptx` (previews in `out/previews/`). On visuals, the built deck wins.

## Core workflow (must always work)

submit → route by role → sign → seal → verify

1. **Submit:** student picks a request type and fills one form.
2. **Route by role:** each request type stores a chain of roles; each role is resolved to a person by the student's department.
3. **Sign:** approver taps Approve / Return / Reject and confirms with a 4-digit PIN; the server signs the decision (Ed25519).
4. **Seal:** on final approval, generate the PDF with a signed QR, SHA-256 the file, anchor the hash on chain.
5. **Verify:** scan QR or upload PDF → Verified, or Tampered on any byte change.

## Roles and people (seed, all CSE, PIN 1234)

| Id | Person | Role |
| --- | --- | --- |
| u_riya | Riya, CSE 2nd year | student |
| u_mehta | Prof. Mehta | faculty_coordinator |
| u_kulkarni | Prof. Kulkarni | hod |
| u_rao | Dr. Rao | dean_sa |
| u_pawar | Mr. Pawar | security |
| u_admin | Admin, Registrar office | admin |

All demo accounts log in with their email (`riya@campus.example`, `kulkarni@campus.example`, `security@campus.example`, `registrar@campus.example`, …) and password `demo1234`; signing PIN 1234.
| u_joshi | Prof. Joshi, Associate Professor | faculty (a delegate) |
| u_iyer / u_shaikh / u_patil / u_desai | Ms. Iyer / Mr. Shaikh / Mr. Patil / Mrs. Desai | librarian / lab_incharge / warden / accounts |

Every demo profile has a placeholder email (`…@campus.example`).

## Request types (v1)

| Type | Chain |
| --- | --- |
| Event permission | Faculty coordinator → (HoD ‖ Security) → Dean SA |
| On-duty | Faculty coordinator → HoD |
| Bonafide | HoD → Dean SA |
| No-dues clearance | (Librarian ‖ Lab in-charge ‖ Hostel warden ‖ Accounts) → HoD |

Event permission fields: title, date, venue, headcount, purpose. Demo request: Robotics fest, Hall B, 5 Nov, 120 students.

## Accounts and the student workspace (Prompt 11)

- **Open sign-up / log in**, one page with two choices: **Student** (name, email, password, signing PIN, department; optional roll number, year) or **Staff / administrator** (same plus designation: Faculty, Faculty coordinator, HoD, Dean SA, Security, Librarian, Lab in-charge, Hostel warden, Accounts office, Registrar / Admin; optional title, employee ID, phone, bio). Log in with email + password. The designation is the role and decides the home (approvers → inbox, Security → gate, Registrar → admin, students → workspace). Profile page edits the optional details.
- **Routing with live accounts:** a role resolves to the holder the student is **connected** with; otherwise the **most recently joined** holder in the student's department. Demo accounts are dated a day earlier, so live sign-ups take over in front of an audience.
- **Student workspace:** documents sidebar (drag and drop, reusable library), **My teachers** as blocks with "Send document", **Add a teacher** search (connection request → staff Accept / Decline in their inbox), "Waiting for your signature", New request, My requests.
- **Send a document to anyone:** staff or another student, picked from everyone (All · Staff · Students, search); no connection needed. It is a **Document for signature** request: one step held by the recipient (role "Recipient"), signed with their PIN, sealed, anchored and verifiable like everything else.
- Demo accounts keep working with email + password `demo1234` (e.g. `riya@campus.example`); the id + PIN shortcut is for tests and is off in production.

## Return, reject, reopen, discuss

- **Return** (comment required): back to the student, who edits and resubmits. On resubmit, review is selective: the approver who returned it and anyone who had not approved yet review again, plus any earlier approver whose `affectedBy` fields changed (attachments count as a change). Everyone else keeps their approval as a `carried` row pointing at the signature they gave before the return ("Approved before the changes · still valid"). The audit log records `changed`, `reapprove` and `kept`.
- **Reject** (comment required): ends the request, unless it is **reopened**: the approver who rejected it, the HoD or the Dean SA can reopen it with a reason and PIN. It becomes `returned`, the student sees "Reopened by …" and resubmits; the resubmission routes like any return.
- **Discussion:** every request has a thread visible to the student, everyone on its chain and the admin. A student's message emails whoever holds the request now plus whoever last returned or rejected it; a staff message emails the student. The discussion never changes the approval itself.

## Amendment: who signs again (`affectedBy` in `apps/api/src/catalog.ts`)

| Role (event permission) | Re-approves when these change |
| --- | --- |
| Faculty coordinator | title, date, venue, headcount, purpose |
| HoD | title, date, venue, headcount |
| Security | headcount |
| Dean SA | title, headcount |

So a **date or venue change goes back to Faculty coordinator + HoD only; Security and Dean SA are carried**. Headcount brings everyone back; purpose only the coordinator. Every other role gets a `carried` approval row pointing at the approval that was actually signed (`carried_from`), so history shows who approved which version.

Amendment rules: student owner only; request must be `sealed`; reason required; only catalogue fields; a no-op is refused. Request becomes `amending` with version n+1 and a new round; v(n) stays sealed and valid. A return or reject during amendment ends only the amendment (status back to `sealed`, `current_version` back to n; the comment shows on the request). When the affected approvers finish, v(n+1) is sealed with `prevHash` = v(n), which the contract marks Superseded.

## On chain vs off chain

- **On chain:** document hash, issuing college ID, request ID, type, version, previous-version hash, signer-roles hash, timestamps, validity window, status (Active / Superseded / Revoked). Never personal data.
- **Off chain (SQLite + storage):** PDF, form data, comments, audit log.

## Twist: "The Plan Changed"

Riya's event permission is sealed; two days later the date and venue change.

1. **Amend:** amend the sealed approval (same request). Only affected approvers re-approve. Date/venue → Faculty coordinator + HoD only; Security and Dean SA are skipped (their approvals are carried over).
2. **Versioned sealing:** seal as v2, linked on chain to v1 (v1 becomes Superseded). History shows who approved which version.
3. **Revocation:** HoD or Dean SA can revoke entirely. An outdated PDF shows "Superseded by v2", a cancelled one "Revoked", never "Verified".
4. **Offline gate check:** Security verifies the QR fully offline: QR carries the essential details and an Ed25519 signature checked locally; valid only on the event date. Revocations after issuance are handled by a signed revocation list synced to the guard device, plus the date-only validity window and a visible freshness indicator (details in `docs/OFFLINE_GATE.md`, prompt 9).

## Operations (added after the core build, on request)

- **Attachments:** students attach PDF/PNG/JPG files (max 5, 5 MB each) on submit, resubmit or amend. Each file's SHA-256 is part of the form hash every approver signs, and it is listed on the sealed PDF. Adding a file in an amendment goes back to the coordinator.
- **No-dues clearance:** Librarian, Lab in-charge, Hostel warden and Accounts in parallel (24 h deadline each), then HoD.
- **Deadlines (SLA):** each step has `sla_hours` (48 by default). Past it: reminder email, step shows **Overdue**. Past twice it: **Escalated**, email to the next authority (coordinator → HoD, HoD → Dean SA, Dean SA → Admin, other roles → HoD). `SLA_MINUTES` shrinks deadlines for demos; Admin has "Run deadline check".
- **Delegation:** an approver sets "Away? Set a delegate" (colleague + date range). Waiting items move to the delegate; new ones route there while it is active; the delegate signs **on behalf of** the original holder (in the signature, timeline and PDF). Ending it hands open items back.
- **Batch approve:** tick several inbox items, one PIN; each is still signed and audited separately. Return/reject stay one at a time.
- **Issuing college ID on chain** (`COLLEGE_ID`), also in the QR pass and on the PDF.
- **Admin:** Requests, **Impact** (approvals digitised, sheets, CO2e, trees, average time to sealed, average wait per role), **Audit log**, **Emails**.
- **Email notifications** through an outbox; `log` by default, AWS SES by configuration (`docs/EMAIL_SES.md`).

## Out of scope for v1

AI/LLM features, DigiLocker, Aadhaar eSign, OTP/SMS, WhatsApp notifications, no-code form builder.
