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

## Request types (v1)

| Type | Chain |
| --- | --- |
| Event permission | Faculty coordinator → (HoD ‖ Security) → Dean SA |
| On-duty | Faculty coordinator → HoD |
| Bonafide | HoD → Dean SA |

Event permission fields: title, date, venue, headcount, purpose. Demo request: Robotics fest, Hall B, 5 Nov, 120 students.

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

- **On chain:** document hash, request ID, type, version, previous-version hash, signer-roles hash, timestamps, validity window, status (Active / Superseded / Revoked). Never personal data.
- **Off chain (SQLite + storage):** PDF, form data, comments, audit log.

## Twist: "The Plan Changed"

Riya's event permission is sealed; two days later the date and venue change.

1. **Amend:** amend the sealed approval (same request). Only affected approvers re-approve. Date/venue → Faculty coordinator + HoD only; Security and Dean SA are skipped (their approvals are carried over).
2. **Versioned sealing:** seal as v2, linked on chain to v1 (v1 becomes Superseded). History shows who approved which version.
3. **Revocation:** HoD or Dean SA can revoke entirely. An outdated PDF shows "Superseded by v2", a cancelled one "Revoked", never "Verified".
4. **Offline gate check:** Security verifies the QR fully offline: QR carries the essential details and an Ed25519 signature checked locally; valid only on the event date. Revocations after issuance are handled by a signed revocation list synced to the guard device, plus the date-only validity window and a visible freshness indicator (details in `docs/OFFLINE_GATE.md`, prompt 9).

## Out of scope for v1

AI/LLM features, DigiLocker, Aadhaar eSign, OTP/SMS, email/WhatsApp notifications, SLA escalation, delegation, no-code form builder, analytics dashboards.
