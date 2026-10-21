# Live demo script

About 8 minutes. Shows the original workflow (submit → route by role → sign → seal → verify) and every part of "The Plan Changed": amendment, versioned sealing, revocation and the offline gate check.

## Before you start

1. `npm install`, then `npm run build`.
2. Start the chain and the app on one port: `npm run start:local` (local chain + API serving the web app on :4000). Or use the deployed https site (`docs/DEPLOY_AWS.md`).
3. Reset to the starting point: `npm run seed:demo`, or **Admin → Reset demo**. Riya now has **Robotics fest, Hall B, 120 students** approved and **sealed as v1**, dated **one week from today**.
4. Phones: the gate needs **https** for the live camera and offline mode. Use the deployed site, or on a LAN run `npm run dev:https -w apps/web` (accept the certificate warning) next to `npm run dev`. Set `PUBLIC_BASE_URL` to the address phones use **before** sealing, because it is printed into each QR.
5. Open the gate once on the guard's phone **online** (Mr. Pawar, PIN 1234) so it installs, caches the issuer key and syncs the list.

Every profile's PIN is **1234**. Two browser windows (or a laptop + a phone) make switching profiles quick.

## A. The original workflow (1 min)

1. **Riya** → Robotics fest → the chain shows Faculty coordinator → HoD ‖ Security (in parallel) → Dean SA, all green, "Approved and sealed". *"Routed by role, signed with a PIN, sealed on chain."*
2. **Download PDF** → open **/verify** → **Upload PDF** → **Verified**, with each role and time. *"Only the SHA-256 is on chain; no personal data."*
3. Optional, live: Riya → New request → Bonafide → Prof. Kulkarni approves → Dr. Rao approves → Sealed in seconds.

## B. The plan changed: amend (1.5 min)

4. **Riya** → Robotics fest → **Amend** → date: **today**, venue: **Main Auditorium**, reason "Hall B under repair". The preview reads **"Goes back to: Faculty coordinator, HoD · Kept: Security, Dean Student Affairs"** → Send amendment. *"Same request, no fresh submission; v1 stays valid while v2 is reviewed."*
5. **Mr. Pawar** and **Dr. Rao** → inbox → **All clear**. *"Security and the Dean are skipped."*
6. **Prof. Mehta** → Review next → the card shows the old date and venue struck through, new ones in bold → Approve + PIN.
7. **Prof. Kulkarni** → Approve + PIN.

## C. Versioned sealing (1 min)

8. **Riya** → **v1 Superseded → v2 Active**. Tap v2: coordinator and HoD "signed v2"; Security and Dean "signed v1, carried". *"Every signature says which version it approved."*
9. **Download PDF** (v2). On /verify upload the **v1** PDF → **Superseded by v2** → **Check v2** → **Verified**. *"v2 is linked on chain to v1; an outdated PDF can never show Verified."*

## D. Offline gate check (2 min)

10. Guard's phone (Mr. Pawar, /gate) → **Sync now** → turn on **airplane mode**. The bar shows "· offline".
11. **Scan pass** on the v2 QR → **VALID · Offline check**, with event, student, venue, today's date. *"Signature checked on the phone; the date window is today only."*
12. Scan the **v1** QR → **SUPERSEDED** (it is on the signed list; its date is also a week away, so even an unsynced phone says NOT TODAY).

## E. Revocation (1.5 min)

13. **Prof. Kulkarni** → Robotics fest → **Revoke approval** (red link) → reason "Event cancelled" + PIN. Toast: tell Security to sync.
14. /verify → upload v2 → **Revoked** ("Cancelled by the HoD on …"); upload v1 → **Revoked** too.
15. Gate phone still in airplane mode → scan v2 → **VALID**. *"This is the one offline gap: a revocation after the last sync. Exposure is limited to the event day, the sync time is always visible, and staff are prompted to tell the gate."* (`docs/OFFLINE_GATE.md`)
16. Airplane mode off → **Sync now** → scan v2 → **REVOKED**.

## F. Tamper (30 s)

17. Open the v2 PDF in a text editor, change one character, save → /verify → Upload → **Tampered**. *"Change one character and the proof breaks."*

## If something goes wrong

- **No network in the room:** run everything on the laptop with `npm run start:local`; the local chain needs no internet. Use "Scan from photo" if the camera is blocked.
- **Chain stopped:** seals and revocations queue and anchor automatically when it is back; verify shows "Sealing in progress", never a false Verified.
- **Need to start over:** Admin → **Reset demo** (or `npm run seed:demo`).
- **Phone camera does not open:** use the phone's own camera app on the PDF's QR (opens /verify directly), or "Scan from photo".
