# PaperLess Campus

Role-routed digital approvals for Indian universities: a student submits once, the system routes the request to the right people by role, each approver signs with one tap and a PIN, and the final PDF is sealed by putting its SHA-256 fingerprint on a blockchain. Anyone can verify a copy by scanning its QR or uploading the file, and the security guard can check a pass at the gate with no internet.

*No queues. No paper. No forged signatures.*

## What it does

- **Open sign-up and log in** as a student or as staff / administrator (designation decides the home), with a profile page.
- **Student workspace**: documents with drag and drop, teachers as blocks (search, connect, accept), and **send a document to anyone** (staff or student) to sign.
- **Submit → route by role → sign → seal → verify** for event permission (coordinator → HoD ‖ Security → Dean SA), on-duty and bonafide requests.
- **Amend a sealed approval**: only the approvers affected by the change sign again (a date or venue change goes back to the coordinator and HoD; Security and the Dean are carried).
- **Versioned sealing**: v2 is linked on chain to v1; v1 then verifies as "Superseded by v2". Full history of who approved which version.
- **Revocation** by the HoD or Dean: every copy then verifies as "Revoked".
- **Offline gate check**: signed QR checked on the guard's phone, valid only on the event date, plus a signed revocation list synced at shift start.
- **Return, reopen, discuss**: returned requests go back only to the people affected, rejected ones can be reopened, and every request has a discussion thread.
- **Operations**: attachments (hashed into what approvers sign), no-dues clearance with parallel approvers, deadlines with reminders and escalation, delegation while away, batch approve, an impact dashboard (paper and CO2e saved, bottlenecks), an audit log and email notifications (AWS SES ready).

## Run it

```bash
npm install
npm run dev            # local chain :8545 + API :4000 + web :5173
```

Open http://localhost:5173 and sign up, or use a demo account (e.g. `riya@campus.example`, password `demo1234`, signing PIN 1234).

Production on one port: `npm run build && npm run start:local` (or `npm start` with `CHAIN_MODE=amoy`), then http://localhost:4000. Demo starting point: `npm run seed:demo`. Settings: copy `.env.example` to `.env`.

## Test

```bash
npm test               # API (102 tests on a real local chain) + contract (8 tests)
```

## Layout

| Path | What |
| --- | --- |
| `apps/api` | Express + SQLite API, routing engine, sealing, chain client, PDF |
| `apps/web` | React app (mobile-first, one main action per screen), verify page, gate app |
| `packages/shared` | Types, pass format, signatures, verdict and gate logic used by both |
| `contracts` | `DocumentRegistry` Solidity contract and local chain helpers |
| `docs` | Context, architecture, design, trust layer, offline gate, demo script, deployment |

## Docs

- [Context](docs/CONTEXT.md) · [Architecture](docs/ARCHITECTURE.md) · [Design](docs/DESIGN.md) · [Trust layer](docs/TRUST.md) · [Offline gate](docs/OFFLINE_GATE.md)
- [Demo script](docs/DEMO.md) · [Deploy on AWS free tier](docs/DEPLOY_AWS.md) · [Email with AWS SES](docs/EMAIL_SES.md) · [Decisions](docs/DECISIONS.md) · [Requirements check](docs/COMPLIANCE.md)
