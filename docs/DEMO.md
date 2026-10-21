# Live demo script

Filled in prompt 10. Until then: `npm install && npm run dev`, open http://localhost:5173, pick any profile, PIN 1234.

## Verify (so far)

1. Seal a request (all approvers approve), download the PDF as the student.
2. Open /verify → Upload PDF → **Verified**.
3. Edit one character of the PDF (any text editor) and upload again → **Tampered**.
4. Scan the PDF's QR with a phone camera app (set `PUBLIC_BASE_URL` to the laptop's LAN address first) → opens /verify and shows **Verified** with the event, student, date and venue from the signed QR.
