# Trust layer

What is signed, hashed, anchored and put in the QR. Code: `apps/api/src/seal.ts`, `apps/api/src/chain.ts`, `apps/api/src/pdf.ts`, `packages/shared/src/pass.ts`, `contracts/contracts/DocumentRegistry.sol`.

## Keys

- **Issuer Ed25519 key** (`apps/api/src/keys.ts`): `ISSUER_PRIVATE_KEY` or generated once into `kv.issuer_private_key`. Public key at `GET /api/issuer-public-key`.
- **Chain wallet**: local = Hardhat dev account #0; Amoy = `AMOY_PRIVATE_KEY`. Only the contract owner can write.

## What is signed

1. **Each approval decision**: canonical JSON `{requestId, version, role, approverId, decision, formHash, signedAt}`; `formHash` = SHA-256 of the canonical form JSON.
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

`Record { requestId (bytes32 "PLC-2026-0001"), docType (bytes32 "event_permission"), version, prevHash, rolesHash, sealedAt (block time), validFrom, validUntil, status }`, keyed by `docHash`. Also `supersededBy[old] = new`, `latestFor[requestId]`, `revokeReason[docHash]`.

Rules: no duplicate hash; v1 has prevHash 0 and only one v1 per request; v(n+1) needs prevHash Active, same request, version + 1, and marks prev **Superseded**; `revoke` only from Active. Owner-only writes. Custom errors: `NotOwner, EmptyHash, AlreadySealed, RequestAlreadySealed, PrevNotActive, PrevOtherRequest, BadVersion, NotActive`.

**Never on chain:** names, roll numbers, department, venue, comments, form contents.

Compiled with the `solc` npm package (`npm run compile -w contracts`, output `contracts/artifacts/DocumentRegistry.json`, EVM `paris`), because compiler downloads may be blocked. Hardhat is only used to run the local node.

## QR pass format

`<PUBLIC_BASE_URL>/verify#p=<token>`, token = `base64url(JSON body) + "." + base64url(Ed25519 sig over the exact body bytes)`.

Body `{rid, v, t (type), ti (title), n (student name), d (department), dt? (event date), ve? (venue), vf, vu (validity, unix s), iat}`. About 390 characters; decodes reliably from the printed PDF.

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
