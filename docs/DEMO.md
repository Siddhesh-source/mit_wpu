# Live demo script

Filled in prompt 10. Until then: `npm install && npm run dev`, open http://localhost:5173, pick any profile, PIN 1234.

## Verify (so far)

1. Seal a request (all approvers approve), download the PDF as the student.
2. Open /verify → Upload PDF → **Verified**.
3. Edit one character of the PDF (any text editor) and upload again → **Tampered**.
4. Scan the PDF's QR with a phone camera app (set `PUBLIC_BASE_URL` to the laptop's LAN address first) → opens /verify and shows **Verified** with the event, student, date and venue from the signed QR.

## Plan changed (so far)

1. Riya (sealed v1) → **Amend** → date 12 Nov, venue Main Auditorium, reason → preview says "Goes back to: Faculty coordinator, HoD · Kept: Security, Dean Student Affairs" → Send.
2. Prof. Mehta and Prof. Kulkarni approve (Security and Dean have nothing in their inbox).
3. Riya's page: **v1 Superseded → v2 Active**; tap v2: Security and Dean "signed v1, carried".
4. /verify → upload the v1 PDF → **Superseded by v2** → Check v2 → **Verified**.
5. Prof. Kulkarni → request → **Revoke approval** → reason + PIN → upload v2 → **Revoked**; upload v1 → **Revoked**.
