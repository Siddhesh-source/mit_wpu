import fs from 'node:fs';
import path from 'node:path';
import { ROLE_LABEL, canonicalJson, encodePass, passUrl, sha256Hex, validityFor, type PassPayload, type Role, type SealInfo, type VerifyResult } from '@plc/shared';
import type { DB } from './db.js';
import type { ChainClient } from './chain.js';
import { issuerKey } from './keys.js';
import { buildApprovalPdf, istDay } from './pdf.js';
import { audit, getType } from './workflow.js';

export interface Services {
  chain: ChainClient | null;
  storageDir: string;
  publicBaseUrl: string;
  /** Public verify calls per IP per minute (default 60). */
  verifyRateLimit?: number;
}

interface SealRow {
  request_id: string;
  version: number;
  doc_hash: string;
  prev_hash: string | null;
  roles_hash: string;
  pass: string;
  pdf_path: string;
  valid_from: number;
  valid_until: number;
  anchor_status: 'pending' | 'anchored';
  chain_status: 'active' | 'superseded' | 'revoked';
  tx_hash: string | null;
  attempts: number;
  created_at: string;
  anchored_at: string | null;
}

const now = () => new Date().toISOString();

/** Approvals that make up a version: decided on it, or carried over to it. */
function signersFor(db: DB, requestId: string, version: number) {
  return db
    .prepare(
      `SELECT a.role, a.decision, a.signed_at, a.signature, a.version, u.name,
              src.version AS src_version, src.signed_at AS src_signed_at, src.signature AS src_signature
         FROM approvals a
         JOIN users u ON u.id = a.assignee_id
         LEFT JOIN approvals src ON src.id = a.carried_from
        WHERE a.request_id = ? AND a.version = ? AND a.decision IN ('approved', 'carried')
          AND a.round = (SELECT MAX(round) FROM approvals WHERE request_id = ? AND version = ?)
        ORDER BY a.step_no, a.id`,
    )
    .all(requestId, version, requestId, version) as {
    role: Role;
    decision: string;
    signed_at: string | null;
    signature: string | null;
    version: number;
    name: string;
    src_version: number | null;
    src_signed_at: string | null;
    src_signature: string | null;
  }[];
}

/**
 * Build the sealed PDF for the request's current version, store it, and queue the hash for anchoring.
 * Then try to anchor straight away; on failure the row stays pending and processQueue retries it.
 */
export async function sealRequest(db: DB, svc: Services, requestId: string) {
  const req = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId) as {
    id: string; student_id: string; department_id: string; type: string; status: string; current_version: number;
  };
  if (req.status !== 'approved') return;
  if (db.prepare('SELECT 1 FROM seals WHERE request_id = ? AND version = ?').get(req.id, req.current_version)) return;

  const type = getType(db, req.type);
  const ver = db.prepare('SELECT form_json, reason FROM request_versions WHERE request_id = ? AND version = ?').get(req.id, req.current_version) as {
    form_json: string; reason: string | null;
  };
  const form = JSON.parse(ver.form_json) as Record<string, string | number>;
  const student = db
    .prepare('SELECT u.name, u.title, d.name AS department FROM users u JOIN departments d ON d.id = u.department_id WHERE u.id = ?')
    .get(req.student_id) as { name: string; title: string; department: string };
  const prev = req.current_version > 1
    ? (db.prepare('SELECT doc_hash FROM seals WHERE request_id = ? AND version = ?').pluck().get(req.id, req.current_version - 1) as string | undefined) ?? null
    : null;

  const signers = signersFor(db, req.id, req.current_version).map((s) => {
    const carried = s.decision === 'carried';
    return {
      role: s.role,
      roleLabel: ROLE_LABEL[s.role],
      name: s.name,
      signedAt: (carried ? s.src_signed_at : s.signed_at)!,
      version: carried ? s.src_version! : s.version,
      carried,
      fingerprint: ((carried ? s.src_signature : s.signature) ?? '').slice(0, 16),
    };
  });
  const rolesHash = sha256Hex(canonicalJson(signers.map((s) => ({ role: s.role, version: s.version, signedAt: s.signedAt }))));

  const issued = new Date();
  const iat = Math.floor(issued.getTime() / 1000);
  const { vf, vu } = validityFor(req.type, form, iat);
  const payload: PassPayload = {
    rid: req.id,
    v: req.current_version,
    t: req.type,
    ti: String(form.title ?? type.name),
    n: student.name,
    d: student.department,
    ...(form.date ? { dt: String(form.date) } : {}),
    ...(form.venue ? { ve: String(form.venue) } : {}),
    vf,
    vu,
    iat,
  };
  const { privateKey } = await issuerKey(db);
  const pass = await encodePass(payload, privateKey);
  const validity =
    req.type === 'event_permission' && form.date
      ? `${istDay(String(form.date))}, 00:00 to 23:59 IST only`
      : `Until ${new Date(vu * 1000).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' })}`;

  const pdf = await buildApprovalPdf({
    requestId: req.id,
    version: req.current_version,
    prevHash: prev,
    reason: ver.reason,
    typeName: type.name,
    title: String(form.title ?? type.name),
    student,
    fields: type.fields,
    form,
    signers,
    validity,
    qrUrl: passUrl(svc.publicBaseUrl, pass),
    issuedAt: issued,
  });
  const docHash = sha256Hex(pdf);
  fs.mkdirSync(svc.storageDir, { recursive: true });
  const file = path.join(svc.storageDir, `${req.id}-v${req.current_version}.pdf`);
  fs.writeFileSync(file, pdf);

  db.transaction(() => {
    db.prepare(
      `INSERT INTO seals (request_id, version, doc_hash, prev_hash, roles_hash, pass, pdf_path, valid_from, valid_until, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(req.id, req.current_version, docHash, prev, rolesHash, pass, file, vf, vu, issued.toISOString());
    db.prepare("UPDATE requests SET status = 'sealing', updated_at = ? WHERE id = ?").run(issued.toISOString(), req.id);
    audit(db, req.id, null, 'sealed', req.current_version, { docHash });
  })();

  await anchor(db, svc, req.id, req.current_version);
}

/** Write one pending seal to the chain. Never throws; failures are recorded for retry. */
export async function anchor(db: DB, svc: Services, requestId: string, version: number) {
  const s = db.prepare('SELECT * FROM seals WHERE request_id = ? AND version = ?').get(requestId, version) as SealRow | undefined;
  if (!s || s.anchor_status !== 'pending' || !svc.chain) return;
  const type = db.prepare('SELECT type FROM requests WHERE id = ?').pluck().get(requestId) as string;
  try {
    const txHash = await svc.chain.seal({
      docHash: s.doc_hash,
      requestId,
      docType: type,
      version,
      prevHash: s.prev_hash,
      rolesHash: s.roles_hash,
      validFrom: s.valid_from,
      validUntil: s.valid_until,
    });
    const t = now();
    db.transaction(() => {
      db.prepare("UPDATE seals SET anchor_status = 'anchored', tx_hash = ?, anchored_at = ?, last_error = NULL WHERE request_id = ? AND version = ?").run(txHash, t, requestId, version);
      if (s.prev_hash) db.prepare("UPDATE seals SET chain_status = 'superseded' WHERE doc_hash = ?").run(s.prev_hash);
      db.prepare("UPDATE requests SET status = 'sealed', updated_at = ? WHERE id = ? AND status = 'sealing' AND current_version = ?").run(t, requestId, version);
      audit(db, requestId, null, 'anchored', version, { txHash, network: svc.chain!.network });
    })();
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    // Already on chain (e.g. a retry after a lost response): treat as anchored.
    if (/: AlreadySealed$/.test(msg) || (await isOnChain(svc, s.doc_hash))) {
      db.prepare("UPDATE seals SET anchor_status = 'anchored', last_error = NULL WHERE request_id = ? AND version = ?").run(requestId, version);
      db.prepare("UPDATE requests SET status = 'sealed' WHERE id = ? AND status = 'sealing' AND current_version = ?").run(requestId, version);
      return;
    }
    db.prepare('UPDATE seals SET attempts = attempts + 1, last_error = ? WHERE request_id = ? AND version = ?').run(msg.slice(0, 300), requestId, version);
  }
}

async function isOnChain(svc: Services, docHash: string) {
  try {
    return (await svc.chain!.get(docHash)).status !== 'none';
  } catch {
    return false;
  }
}

/** Retry every pending seal, oldest first (order matters: v1 must land before v2). */
export async function processQueue(db: DB, svc: Services) {
  // A cheap read first: it notices a restarted local chain and triggers the redeploy + replay.
  if (svc.chain && db.prepare('SELECT 1 FROM seals LIMIT 1').get()) await svc.chain.get('00'.repeat(32)).catch(() => undefined);
  const rows = db.prepare("SELECT request_id, version FROM seals WHERE anchor_status = 'pending' ORDER BY created_at, rowid").all() as { request_id: string; version: number }[];
  for (const r of rows) await anchor(db, svc, r.request_id, r.version);
}

/** After a fresh contract deploy (local node restarted), queue every seal again so the chain matches the database. */
export function replayAll(db: DB) {
  db.prepare("UPDATE seals SET anchor_status = 'pending', attempts = 0").run();
}

export function sealInfo(db: DB, svc: Services, requestId: string): SealInfo | null {
  const s = db.prepare('SELECT * FROM seals WHERE request_id = ? ORDER BY version DESC LIMIT 1').get(requestId) as SealRow | undefined;
  if (!s) return null;
  return {
    version: s.version,
    docHash: s.doc_hash,
    anchor: s.anchor_status,
    chainStatus: s.chain_status,
    txHash: s.tx_hash,
    txUrl: svc.chain?.txUrl(s.tx_hash) ?? null,
    sealedAt: s.created_at,
    validFrom: s.valid_from,
    validUntil: s.valid_until,
  };
}

export function pdfPath(db: DB, requestId: string, version?: number) {
  const row = (version
    ? db.prepare('SELECT pdf_path, version FROM seals WHERE request_id = ? AND version = ?').get(requestId, version)
    : db.prepare('SELECT pdf_path, version FROM seals WHERE request_id = ? ORDER BY version DESC LIMIT 1').get(requestId)) as
    | { pdf_path: string; version: number }
    | undefined;
  return row && fs.existsSync(row.pdf_path) ? row : null;
}

const STATUS_FROM_CHAIN = { active: 'verified', superseded: 'superseded', revoked: 'revoked' } as const;

/** Public verification by document hash. The chain is the source of truth; the database fills in labels. */
export async function verifyHash(db: DB, svc: Services, rawHash: string): Promise<VerifyResult> {
  const docHash = rawHash.replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(docHash)) return { status: 'not_found' };
  const s = db.prepare('SELECT * FROM seals WHERE doc_hash = ?').get(docHash) as SealRow | undefined;

  let source: 'chain' | 'cache' = 'cache';
  let chainStatus: SealRow['chain_status'] | null = s?.anchor_status === 'anchored' ? s.chain_status : null;
  let revokeReason: number | undefined;
  let onChainNext: string | null = null;
  if (svc.chain) {
    try {
      const rec = await svc.chain.get(docHash);
      source = 'chain';
      chainStatus = rec.status === 'none' ? null : rec.status;
      revokeReason = rec.revokeReason || undefined;
      onChainNext = rec.supersededBy;
    } catch {
      /* chain unreachable: fall back to the mirrored status */
    }
  }

  if (!s) return { status: 'not_found', docHash };
  if (!chainStatus) return { status: s.anchor_status === 'pending' ? 'pending' : 'not_found', docHash, requestId: s.request_id, version: s.version };

  const type = db.prepare('SELECT r.type, t.name FROM requests r JOIN request_types t ON t.code = r.type WHERE r.id = ?').get(s.request_id) as { type: string; name: string };
  const next = onChainNext ?? (db.prepare('SELECT doc_hash FROM seals WHERE prev_hash = ?').pluck().get(docHash) as string | undefined) ?? null;
  const nextRow = next ? (db.prepare('SELECT version, doc_hash FROM seals WHERE doc_hash = ?').get(next) as { version: number; doc_hash: string } | undefined) : undefined;
  const latest = db.prepare("SELECT version, doc_hash FROM seals WHERE request_id = ? AND anchor_status = 'anchored' ORDER BY version DESC LIMIT 1").get(s.request_id) as
    | { version: number; doc_hash: string }
    | undefined;
  const signers = signersFor(db, s.request_id, s.version).map((x) => ({
    role: x.role,
    roleLabel: ROLE_LABEL[x.role],
    signedAt: x.decision === 'carried' ? x.src_signed_at : x.signed_at,
    version: x.decision === 'carried' ? x.src_version! : x.version,
    carried: x.decision === 'carried',
  }));

  return {
    status: STATUS_FROM_CHAIN[chainStatus],
    docHash,
    requestId: s.request_id,
    version: s.version,
    type: type.type,
    typeName: type.name,
    sealedAt: Math.floor(new Date(s.anchored_at ?? s.created_at).getTime() / 1000),
    validFrom: s.valid_from,
    validUntil: s.valid_until,
    signers,
    supersededBy: nextRow ? { version: nextRow.version, docHash: nextRow.doc_hash } : null,
    latest: latest ? { version: latest.version, docHash: latest.doc_hash } : null,
    revokeReason,
    txHash: s.tx_hash,
    txUrl: svc.chain?.txUrl(s.tx_hash) ?? null,
    network: svc.chain?.network,
    source,
  };
}

export async function verifyRef(db: DB, svc: Services, requestId: string, version: number): Promise<VerifyResult> {
  const hash = db.prepare('SELECT doc_hash FROM seals WHERE request_id = ? AND version = ?').pluck().get(requestId, version) as string | undefined;
  return hash ? verifyHash(db, svc, hash) : { status: 'not_found', requestId, version };
}
