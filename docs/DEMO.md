# Demo script

**10 minutes for the main path**, plus optional extras. Lines in *italics* are what to say. The order is deliberate:
the real form first (the moment people remember), then proof that it cannot be faked, then how it copes when plans
change, then the tools that make a department run on it.

> **One-line pitch:** *CampusSign turns every signature-chasing form on campus into one tap: the student sends the
> university's own form, the right people sign it in order, their signatures land exactly where the form asks, and
> anyone can verify the result in seconds because its fingerprint is on a blockchain.*

## Before you start (10 minutes, once)

1. Open **https://campussign.duckdns.org** on the laptop and on one phone (https is needed for the phone camera and
   the offline gate).
2. **Reset** the starting point: sign in as `registrar@campus.example` → **Admin → Reset demo**. Riya now has
   **Robotics fest, Hall B, 120 students**, approved and **signed as v1**, dated a week from today. (Locally:
   `npm run start:local`, then `npm run seed:demo`.)
3. On the phone, open **/gate** once **online** as `security@campus.example` so it installs, caches the issuer key and
   syncs the revocation list.
4. Keep these windows ready: **laptop** = student, **second browser window or private window** = faculty,
   **phone** = faculty or the guard. Email notifications arrive in the configured inbox (Admin → Emails lists them).
5. Have a **text editor** ready for the tamper step, and the downloads folder open.

### Accounts (password `demo1234`, signing PIN `1234`)

| Who | Email | Has |
| --- | --- | --- |
| Prof. Dr. Minal Barhate, Guide, AIDS | `minal.barhate@campus.example` | Stored signature |
| Dr. Shital Parag Dongre, HoD, AIDS | `shital.dongre@campus.example` | Stored signature |
| Riya, student, CSE | `riya@campus.example` | Robotics fest (signed v1) |
| Prof. Mehta, Faculty coordinator, CSE | `mehta@campus.example` | |
| Prof. Kulkarni, HoD, CSE | `kulkarni@campus.example` | |
| Dr. Rao, Dean Student Affairs | `rao@campus.example` | |
| Mr. Pawar, Security | `security@campus.example` | Gate |
| Registrar | `registrar@campus.example` | Admin, impact, audit |

## 0. The problem (30 s)

Hold up a printed FF 180. *"Project Registration, FF No. 180. Eight pages, three signatures: guide, coordinator,
HoD. Today that is a printout, a queue outside two cabins, and a paper copy nobody can check. Here is the same form
on CampusSign."*

## 1. A real form, signed in place (3 min) — the hero

**Student (laptop).** Sign up live: **I'm a student → Sign up**, your name, email, a password, a 4-digit signing PIN, department
**Artificial Intelligence and Data Science**. *"Open sign-up; the department decides who signs."*

1. **New request → VIT forms, signed in place → Project Registration & Progress Review (FF No. 180).** Fill the
   group, project title, area and members → **Create the form**. *"The form is generated in the university's
   format, filled with my details, and it already knows where each signature goes."*
2. The send page opens with the PDF on the left and three signature boxes on page 1. On the right:
   - **Guide:** tap **Prof. Dr. Minal Barhate** (suggested in one tap).
   - **Head of Department:** tap **Dr. Shital Parag Dongre**.
   - **Project Coordinator:** leave it; the bar says its box stays empty.
3. Drag a box a little, resize it, to show it is yours to place. Give it a title → **Send to Barhate + 1** (the bar
   at the bottom). *"They sign in this order. Each signature will land in its box."*

**Guide (phone or second window, `minal.barhate@`).**

4. The dashboard: **1 waiting for your signature**, and **My signature** in the side column. *"Faculty save their
   signature once: draw it, type it or upload a photo."*
5. **Review next** → the card shows the form with **her box highlighted** and "goes in 1 place". **Approve and sign**
   → PIN. *"PIN-confirmed, signed by the server with Ed25519, and the signature image is captured at this moment."*

**Student (laptop).** Open the request: **her signature is now sitting in the Guide box** on the form; the HoD's box
waits. *"I can watch it fill up."*

**HoD (`shital.dongre@`).** Review next → Approve and sign → PIN.

6. Student → **Download signed PDF**. Open it. *"This is the original form, page for page. Signatures exactly in the
   boxes, a caption under each one with who, as what and when, a verify line on every page, and one certificate page
   at the end with the signers, the original file's fingerprint and a QR."*

**Variation (1 min, if they ask "does it work with our own PDFs?"):** Send a document → choose any PDF in
**My documents** → add Barhate as **Guide** and Dongre as **Head of Department** → **Find sign spots**. *"It reads
the form's own words, 'Guide', 'Head of Department', 'Signature of Guide:', and puts the boxes there."*

## 2. It cannot be faked (1 min)

7. **Verify** (top bar) → **Upload PDF** → the signed FF 180 → **Verified**, with every signer and time. *"Only the
   SHA-256 fingerprint is on chain. No personal data."*
8. Open the PDF in a text editor, change one character, save → upload again → **Tampered**. *"Change one character
   and the proof breaks. A scanned wet signature can't do that."*

## 3. The plan changed (4 min)

Riya's **Robotics fest** is already signed as v1 (Faculty coordinator → HoD ‖ Security → Dean SA).

9. **Amend** (`riya@`) → Robotics fest → **Amend** → date **today**, venue **Main Auditorium**, reason "Hall B under
   repair". The preview: **"Goes back to: Faculty coordinator, HoD · Kept: Security, Dean Student Affairs"** → Send.
   *"Only the people the change affects sign again. v1 stays valid meanwhile."*
10. `mehta@` → the card shows the old date and venue struck through → Approve + PIN. `kulkarni@` → Approve + PIN.
11. **Versions:** Riya → **v1 Superseded → v2 Active**; v2 lists coordinator and HoD "signed v2", Security and Dean
    "signed v1, carried". On Verify, upload the **v1** PDF → **Superseded by v2** → **Check v2** → **Verified**.
12. **Offline gate:** phone as `security@` → /gate → **Sync now** → **airplane mode** → **Scan pass** on the v2 QR →
    **VALID · offline check**. Scan v1 → **SUPERSEDED**. *"The signature is checked on the phone; the pass is valid
    only on the event date."*
13. **Revoke:** `kulkarni@` → Robotics fest → **Revoke approval** → reason, PIN. Verify: v2 and v1 now say
    **Revoked**. The phone, still offline, says **VALID** (the honest gap: a revocation after the last sync, limited to
    the event day, with the sync time on screen). Airplane mode off → **Sync now** → **REVOKED**.

## 4. A department runs on it (optional, 2 min)

- **Faculty dashboard** (`kulkarni@`): Review next, the waiting list (open any one), recent decisions, **History**
  (filters, search, Export CSV), **Approve several** with one PIN.
- **Away? Set a delegate:** Prof. Kulkarni → Prof. Joshi for today; Joshi's card says "signing for Prof. Kulkarni",
  and so does the PDF.
- **Classes:** Barhate → **People → Classes → New class** → invite the student's registered email → the code arrives
  by email → the student enters it under **My teachers → Classes**. *"Only the account it was sent to can join."*
- **Custom request:** New request → **Write your own request** → pick who signs by designation, in order.
- **Return and discuss:** a return needs a comment; the student replies in **Discussion**, edits, and sees who signs
  again before resubmitting. A rejection can be **reopened**.
- **Reminders and escalation:** start the server with `SLA_MINUTES=1`; untouched steps show **Reminder sent**, then
  **Escalated** to the next authority (or Admin → Run deadline check).
- **Registrar:** **Impact** (approvals signed, paper and CO2e saved, where approvals wait), **Audit log** (every
  action), **Emails** (every notification).

## Close (20 s)

*"One form in, signed by the right people in order, signatures where the form asks for them, verifiable by anyone in
seconds, and it still works at the gate with no network. FF 180 today; any form the university uses tomorrow: the
template library already has leave, internship NOC and industrial visit forms."*

## Questions you will get

| Question | Answer |
| --- | --- |
| Is this a legal e-signature? | It is a PIN-confirmed, server-signed (Ed25519) approval with a tamper-evident record on chain. Aadhaar eSign is the natural next step for documents that legally require it. |
| What is on the blockchain? | Only the document's SHA-256, the issuing college ID, request ID, version and status. No names, no form data. |
| What if the chain or internet is down? | Signing continues; anchoring queues and retries. Verify never says Verified before the record is on chain. The gate works fully offline. |
| Can someone reuse a faculty member's signature? | The image is only placed by an approval made with that person's PIN; the image used is stored with that approval, and the whole document is hashed. A copied image on another PDF fails verification. |
| What does it cost to run? | One small cloud server; email per message on AWS SES. No per-signature fees. |
| Does it need our forms rebuilt? | No. Upload the PDF as it is; place boxes or let Find sign spots do it. Templates are a shortcut, not a requirement. |

## If something goes wrong

- **No network in the room:** run locally with `npm run start:local` (the local chain needs no internet), then
  `npm run seed:demo`. Use **Scan from photo** if the camera is blocked.
- **A signer has no signature saved:** the card says so; **Add it now** opens the pad (Draw is fastest).
- **The send button says what is missing** (document, signer, title); follow it.
- **Chain stopped:** signing queues and anchors when it is back; Verify shows "Signing in progress", never a false
  Verified.
- **Start over:** Admin → **Reset demo**. The AIDS guide and HoD, with their signatures, are restored too.
- **Phone camera does not open:** point the phone's own camera app at the QR (it opens Verify directly), or use
  Scan from photo.
