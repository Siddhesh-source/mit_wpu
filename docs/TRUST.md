# Trust layer

What is signed, hashed, anchored and put in the QR. Code: `apps/api/src/seal.ts`, `apps/api/src/chain.ts`, `apps/api/src/pdf.ts`, `packages/shared/src/pass.ts`, `contracts/contracts/DocumentRegistry.sol`.

## Keys

- **Issuer Ed25519 key** (`apps/api/src/keys.ts`): `ISSUER_PRIVATE_KEY` or generated once into `kv.issuer_private_key`. Public key at `GET /api/issuer-public-key`.
- **Chain wallet**: local = Hardhat dev account #0; Amoy = `AMOY_PRIVATE_KEY`. Only the contract owner can write.

## What is signed

1. **Each approval decision**: canonical JSON `{requestId, version, role, approverId, onBehalfOf?, decision, formHash, signedAt}`; `formHash` = SHA-256 of the canonical form JSON, or of `{form, attachments: [sha256 of each file]}` when files are attached. `onBehalfOf` is set when a delegate signs for someone away.
2. **The QR pass**: see below.

## Sealing pipeline (runs when the last approver approves)

1. Collect the version's signers (approved on this version, or carried from an earlier one).
2. `rolesHash` = SHA-256 of canonical `[{role, version, signedAt}]`.
3. Build the pass and sign it; compute the validity window.
4. Render the PDF (A4, deck theme): type, ID, version, title, student, fields, validity, approvals with signature fingerprints, QR (bottom right), footer "Hash only, no personal data on chain". **No "Verified" stamp on the file**: only a live scan may say Verified.
5. `docHash` = SHA-256 of the final PDF bytes. Saved to `STORAGE_DIR/<id>-v<n>.pdf`; row in `seals` (anchor_status `pending`); request status `sealing`.
6. `DocumentRegistry.seal(docHash, record)`; on success `anchored`, request `sealed`, audit `anchored {txHash}`.

**Why the QR does not contain the file hash:** a file cannot contain its own hash. The QR identifies the approval by `(rid, v)` and is protected by its own signature. Uploading a file → hash → chain lookup catches any byte change. Scanning a QR → signature check offline, then live status by `(rid, v)` online.

## On chain (`DocumentRegistry`)

`Record { issuer (bytes32 college id, e.g. "COLLEGE-001"), requestId (bytes32 "PLC-2026-0001"), docType (bytes32 "event_permission"), version, prevHash, rolesHash, sealedAt (block time), validFrom, validUntil, status }`, keyed by `docHash`. Also `supersededBy[old] = new`, `latestFor[requestId]`, `revokeReason[docHash]`.

Rules: no duplicate hash; v1 has prevHash 0 and only one v1 per request; v(n+1) needs prevHash Active, same request, version + 1, and marks prev **Superseded**; `revoke` only from Active. Owner-only writes. Custom errors: `NotOwner, EmptyHash, AlreadySealed, RequestAlreadySealed, PrevNotActive, PrevOtherRequest, BadVersion, NotActive`.

**Never on chain:** names, roll numbers, department, venue, comments, form contents.

Compiled with the `solc` npm package (`npm run compile -w contracts`, output `contracts/artifacts/DocumentRegistry.json`, EVM `paris`), because compiler downloads may be blocked. Hardhat is only used to run the local node.

## QR pass format

`<PUBLIC_BASE_URL>/verify#p=<token>`, token = `base64url(JSON body) + "." + base64url(Ed25519 sig over the exact body bytes)`.

Body `{c (college id), rid, v, t (type), ti (title), n (student name), d (department), dt? (event date), ve? (venue), vf, vu (validity, unix s), iat}`. About 390 characters; decodes reliably from the printed PDF.

Validity: event permission = event date 00:00:00 to 23:59:59 IST; other types = one year from issue.

Helpers in `packages/shared/src/pass.ts`: `encodePass`, `decodePass`, `verifyPass` (works offline in the browser), `passFromText`, `passUrl`, `validityFor`.

## Chain connectivity

- **Contract address is stored per database** (`kv.registry_address:<network>`). A fresh database deploys a fresh contract, so request IDs never clash with an old run.
- **Before every read/write the client checks the contract still has code.** If the local node restarted, it redeploys and calls `replayAll` (every seal → pending), and the queue re-anchors them in order. This prevents "successful" writes to an empty address.
- **Queue-and-retry:** failed anchors stay `pending` with `attempts`/`last_error`; `processQueue` runs every 5 s, oldest first (v1 before v2). Verify reports `pending`, never `verified`, until anchored.
- Writes are serialised (one at a time) so nonces never collide; ethers cache disabled (`cacheTimeout: -1`).
- `GET /api/health` shows the network and contract address.

## Verify API (public, no personal data)

`GET /api/verify/hash/:hash` and `GET /api/verify/ref/:rid/:v` → `VerifyResult { status: verified | superseded | revoked | pending | not_found, requestId, version, type, typeName, sealedAt, validFrom, validUntil, signers[{role, signedAt, version, carried}], supersededBy, latest, revokeReason, txHash, txUrl, network, source: chain | cache }`. Chain is the source of truth; if unreachable, the mirrored status from `seals` is used with `source: cache`.

## Switching to Polygon Amoy

Set `CHAIN_MODE=amoy`, `AMOY_PRIVATE_KEY` (funded test wallet), optionally `AMOY_RPC_URL`. The first seal deploys the contract and stores its address. `txUrl` links to `amoy.polygonscan.com`.

## Version chain (prompt 7)

- Amended versions are sealed with `prevHash` = previous version's `docHash`; the contract marks the previous one **Superseded** and sets `supersededBy[prev] = new`. A link from a non-Active version is refused (`PrevNotActive`).
- The v2 PDF says "v2 · Amends v1 (hash…) - reason" and each signer line says which version they approved ("approved v1, carried to v2").
- `GET /api/requests/:id/history` (owner, chain members, admin): every version with `state` (active / superseded / revoked / sealing / in_review / abandoned), hash, tx, reason, and per-role approvals with `signedVersion` and `carried`.

## Revocation (prompt 8)

- `POST /api/requests/:id/revoke {reason, pin}`: HoD or Dean SA **of the request's department** only; request must be `sealed` or `amending`; latest seal must be anchored. Wrong PIN 401, no reason 400, others 403, twice 409.
- Effects: `revocations` row (signed by the issuer key over `{requestId, version, docHash, role, actorId, reason, at}`), request `revoked`, a pending amendment is cancelled, `DocumentRegistry.revoke(docHash, reasonCode)` with reason code 1 = HoD, 2 = Dean SA.
- Revocations are queued like seals (`anchor_status`, retried by `processQueue` after seals; replayed after a chain restart). **Verify reads the database revocation first**, so a document reads Revoked immediately, even while the chain write is still pending.
- Every version of a revoked request verifies as **Revoked** (also an older, already superseded v1).
- Public verify shows the revoking role and date only; the free-text reason and the person's name stay private.

## Verdict precedence (`packages/shared/src/status.ts`)

`verdictFor({revoked, superseded, validFrom, validUntil, now})` → **revoked > superseded > not_yet_valid / expired > verified**. Used by the verify API (and the gate in prompt 9). The verify API reports `not_yet_valid` as `verified` + `notYetValid: true` (a genuine document checked before its date), and `expired` as its own status; the gate treats both as NOT TODAY.

## Signed revocation list (for offline gates)

`GET /api/revocations` (public, rate limited) → `{ list: { issuedAt, entries: [{rid, v, hash, status: revoked|superseded, at}] }, signature }`; `signature` = issuer Ed25519 over the canonical JSON of `list`. Contains every version of each revoked request and every version superseded by a newer **anchored** version. Untouched approvals are not listed.
