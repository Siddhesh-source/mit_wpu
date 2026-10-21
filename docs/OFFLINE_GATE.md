# Offline gate check

Security verifies a pass at the venue gate with **no internet**. Code: `packages/shared/src/gate.ts` (decision), `apps/web/src/pages/Gate.tsx` (screen), `apps/web/src/lib/gate.ts` (sync + live check), `apps/web/public/sw.js` (offline app shell). Tests: `apps/api/test/gate.test.ts`.

## What the QR carries

`/verify#p=<token>`; token = signed JSON `{rid, v, t, ti (event), n (student), d (department), dt (date), ve (venue), vf, vu (validity, unix s), iat}` + Ed25519 signature by the college's issuer key. Everything the guard needs to decide is inside the QR; nothing has to be fetched.

## The decision (`gateCheck`)

1. **Signature**: checked on the phone with the cached issuer public key. Forged or edited pass → **INVALID**.
2. **Validity window**: event date 00:00:00 to 23:59:59 IST, against the phone's clock. Any other day → **NOT TODAY**.
3. **Cached revocation list**: signed by the issuer; a list with a bad signature is ignored. Listed as revoked → **REVOKED**; listed as superseded → **SUPERSEDED**.
4. **Live status** (only if the network answers within 2.5 s): wins over the cached list.

Precedence everywhere (shared `verdictFor`): Revoked > Superseded > outside the date > Valid.

| Screen word | Colour | Meaning |
| --- | --- | --- |
| VALID | green | Genuine, today is the event date, not on the list. Shows event, student, department, venue, date, version, "Offline check" / "Online check" |
| NOT TODAY | amber | Genuine, but valid only on the date shown |
| SUPERSEDED | amber | An amended version exists; ask for the latest pass |
| REVOKED | red | Cancelled by the HoD or Dean |
| INVALID | red | Bad signature or not a CampusSign pass |

## Offline readiness

- The gate is part of the installable app (`manifest.webmanifest`, `sw.js`). After **one online visit** in a production build (`npm run build && npm start`, or the deployed site), the app shell, scripts and fonts load with no network.
- The issuer public key and the signed revocation list are kept in the phone's local storage.
- The signed-in Security profile stays available offline (only a server "session expired" signs out).
- Browsers allow camera access and service workers only on **https** or **localhost**. Use the deployed https site, or `npm run dev:https -w apps/web` on a LAN. Without https, "Scan from photo" still works.

## Freshness

The top bar shows "Revocation list synced 08:02 · 3 entries". It syncs on open, every 5 minutes while online, when the phone comes back online, and on **Sync now**. If the list is older than 12 hours or was not synced today (IST), the bar turns amber and every offline VALID shows "List not synced today".

## How revocations after QR issuance are handled offline

A device with no connection cannot learn about a revocation it has not received. The design keeps that gap small and visible:

1. **Date-only validity.** A pass is valid only on its event date, so an old, copied or stolen pass is useless on any other day. Exposure is limited to the event day itself.
2. **Signed revocation list, synced at shift start.** Every revoked approval (all its versions) and every superseded version is in the list the moment it happens. Anything revoked before the guard's last sync is caught fully offline. The list is signed, so it cannot be edited to remove an entry.
3. **Visible freshness.** The guard always sees when the list was last synced, and is warned on every VALID result when it is stale.
4. **Amendments close themselves.** When v2 replaces v1, v1 is added to the list, and v1's QR also carries the *old* date, so on the new event date it already fails as NOT TODAY even on a phone that never synced.
5. **Live wins when there is signal.** Each scan tries the server for 2.5 s; a live REVOKED overrides the cached list.

**Remaining window:** a pass revoked *after* the guard's last sync and scanned *before* the next one, on the event day, with no signal, reads VALID with the amber "List not synced today" warning if the list is old. Procedure: the HoD or Dean who revokes is reminded to tell Security directly (shown right after revoking), and the guard syncs whenever the bar is amber or signal returns. This trade-off is tested explicitly (`gate.test.ts`: "the known gap").
