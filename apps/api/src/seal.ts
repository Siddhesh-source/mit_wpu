import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import {
  ROLE_LABEL, canonicalJson, encodePass, passUrl, sha256Hex, signJson, validityFor, verdictFor,
  type Decision, type PassPayload, type RequestDetail, type RevocationEntry, type RevocationList, type Role, type SealInfo, type VerifyResult, type VersionHistory,
} from '@plc/shared';
import { HttpError } from './errors.js';
import { link, notify } from './notify.js';
import type { DB } from './db.js';
import type { ChainClient } from './chain.js';
import { issuerKey } from './keys.js';
import { buildApprovalPdf, istDay } from './pdf.js';
import { audit, getType } from './workflow.js';

export interface Services {
  chain: ChainClient | null;
  storageDir: string;
  publicBaseUrl: string;
  /** Issuing college id, written on chain with every seal. */
  collegeId?: string;
  /** Upload size limit in MB (default 5). */
  maxUploadMb?: number;
  /** Demo: every SLA counts as this many minutes. */
  slaMinutes?: number | null;
  /** Allow the old demo-profile id + PIN log in (dev/tests). */
  allowPinLogin?: boolean;
  /** Public verify calls per IP per minute (default 60). */
  verifyRateLimit?: number;
  /** PIN attempts (login, sign, revoke) per IP per minute (default 20): a 4-digit PIN must not be brute-forced. */
  pinRateLimit?: number;
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
              src.version AS src_version, src.signed_at AS src_signed_at, src.signature AS src_signature,
              COALESCE(ob.name, sob.name) AS on_behalf_name,
              su.name AS src_name
         FROM approvals a
         JOIN users u ON u.id = a.assignee_id
         LEFT JOIN approvals src ON src.id = a.carried_from
         LEFT JOIN users su ON su.id = src.assignee_id
         LEFT JOIN users ob ON ob.id = a.on_behalf_of
         LEFT JOIN users sob ON sob.id = src.on_behalf_of
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
    on_behalf_name: string | null;
    src_name: string | null;
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
      name: carried ? (s.src_name ?? s.name) : s.name,
      onBehalfOf: s.on_behalf_name,
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
  const collegeId = svc.collegeId ?? 'COLLEGE-001';
  const payload: PassPayload = {
    c: collegeId,
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
    attachments: db
      .prepare('SELECT name, sha256, size FROM attachments WHERE request_id = ? AND version <= ? ORDER BY created_at, id')
      .all(req.id, req.current_version) as { name: string; sha256: string; size: number }[],
    collegeId,
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
      issuer: svc.collegeId ?? 'COLLEGE-001',
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
      if (!s.anchored_at) {
        // First time on chain only (a replay after a chain restart does not email again).
        const student = db.prepare('SELECT student_id FROM requests WHERE id = ?').pluck().get(requestId) as string;
        const title = String(JSON.parse(db.prepare('SELECT form_json FROM request_versions WHERE request_id = ? AND version = ?').pluck().get(requestId, version) as string).title ?? requestId);
        notify(db, student, 'sealed', `Approved and signed: ${title}${version > 1 ? ` (v${version})` : ''}`, `Your approval is signed on chain${version > 1 ? ` as v${version}; v${version - 1} is now superseded` : ''}. Download the PDF with its QR:\n${link(`/requests/${requestId}`)}`, requestId);
      }
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
  const revs = db.prepare("SELECT request_id FROM revocations WHERE anchor_status = 'pending' ORDER BY created_at").pluck().all() as string[];
  for (const id of revs) await anchorRevocation(db, svc, id);
}

/** After a fresh contract deploy (local node restarted), queue every seal again so the chain matches the database. */
export function replayAll(db: DB) {
  db.prepare("UPDATE seals SET anchor_status = 'pending', attempts = 0").run();
  db.prepare("UPDATE revocations SET anchor_status = 'pending', attempts = 0").run();
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
  const revocation = db.prepare('SELECT role, created_at FROM revocations WHERE request_id = ?').get(s.request_id) as { role: Role; created_at: string } | undefined;
  if (!chainStatus && !revocation) return { status: s.anchor_status === 'pending' ? 'pending' : 'not_found', docHash, requestId: s.request_id, version: s.version };

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

  const supersededInDb = !!db.prepare("SELECT 1 FROM seals WHERE request_id = ? AND version > ? AND anchor_status = 'anchored'").get(s.request_id, s.version);
  const verdict = verdictFor({
    revoked: !!revocation || chainStatus === 'revoked',
    superseded: chainStatus === 'superseded' || supersededInDb,
    validFrom: s.valid_from,
    validUntil: s.valid_until,
    now: Math.floor(Date.now() / 1000),
  });
  let issuer: string | undefined;
  try {
    issuer = svc.chain ? (await svc.chain.get(docHash)).issuer || undefined : undefined;
  } catch {
    issuer = undefined;
  }
  return {
    status: verdict === 'not_yet_valid' ? 'verified' : verdict,
    issuer,
    notYetValid: verdict === 'not_yet_valid',
    revokedBy: revocation ? { role: revocation.role, roleLabel: ROLE_LABEL[revocation.role], at: revocation.created_at } : null,
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

// ---------- revocation ----------

const REASON_CODE: Partial<Record<Role, number>> = { hod: 1, dean_sa: 2 };

/**
 * HoD or Dean SA of the request's department revokes the approval entirely. The latest sealed version is
 * revoked on chain; every version of the request then verifies as Revoked. A pending amendment is cancelled.
 */
export async function revokeRequest(db: DB, svc: Services, userId: string, requestId: string, reason: unknown, pin: unknown) {
  const req = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId) as
    | { id: string; department_id: string; status: string; current_version: number; round: number }
    | undefined;
  if (!req) throw new HttpError(404, 'Request not found');
  const role = db
    .prepare("SELECT role FROM user_roles WHERE user_id = ? AND department_id = ? AND role IN ('hod', 'dean_sa') ORDER BY role DESC LIMIT 1")
    .pluck()
    .get(userId, req.department_id) as Role | undefined;
  if (!role) throw new HttpError(403, 'Only the HoD or Dean can revoke an approval');
  if (req.status === 'revoked') throw new HttpError(409, 'Already revoked');
  if (req.status !== 'sealed' && req.status !== 'amending') throw new HttpError(409, 'Only a signed approval can be revoked');
  const user = db.prepare('SELECT pin_hash FROM users WHERE id = ?').get(userId) as { pin_hash: string };
  if (typeof pin !== 'string' || !bcrypt.compareSync(pin, user.pin_hash)) throw new HttpError(401, 'Wrong PIN');
  if (typeof reason !== 'string' || !reason.trim()) throw new HttpError(400, 'Give a reason for the record');

  const seal = db.prepare('SELECT version, doc_hash, anchor_status FROM seals WHERE request_id = ? ORDER BY version DESC LIMIT 1').get(req.id) as
    | { version: number; doc_hash: string; anchor_status: string }
    | undefined;
  if (!seal) throw new HttpError(409, 'Only a signed approval can be revoked');
  if (seal.anchor_status !== 'anchored') throw new HttpError(409, 'Still signing on chain, try again in a moment');

  const at = new Date().toISOString();
  const { privateKey } = await issuerKey(db);
  const note = reason.trim().slice(0, 500);
  const signature = await signJson({ requestId: req.id, version: seal.version, docHash: seal.doc_hash, role, actorId: userId, reason: note, at }, privateKey);

  db.transaction(() => {
    db.prepare(
      'INSERT INTO revocations (request_id, version, doc_hash, role, actor_id, reason, reason_code, signature, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(req.id, seal.version, seal.doc_hash, role, userId, note, REASON_CODE[role] ?? 0, signature, at);
    if (req.status === 'amending') {
      // The amendment in review dies with the approval.
      db.prepare("UPDATE approvals SET decision = 'cancelled' WHERE request_id = ? AND round = ? AND decision IN ('pending', 'waiting')").run(req.id, req.round);
      const sealedRound = db.prepare('SELECT MAX(round) FROM approvals WHERE request_id = ? AND version = ?').pluck().get(req.id, seal.version);
      db.prepare('UPDATE requests SET current_version = ?, round = ? WHERE id = ?').run(seal.version, sealedRound, req.id);
    }
    db.prepare("UPDATE requests SET status = 'revoked', updated_at = ? WHERE id = ?").run(at, req.id);
    db.prepare("UPDATE seals SET chain_status = 'revoked' WHERE doc_hash = ?").run(seal.doc_hash);
    audit(db, req.id, userId, 'revoked', seal.version, { role, reason: note });
    const student = db.prepare('SELECT student_id FROM requests WHERE id = ?').pluck().get(req.id) as string;
    const title = String(JSON.parse(db.prepare('SELECT form_json FROM request_versions WHERE request_id = ? AND version = ?').pluck().get(req.id, seal.version) as string).title ?? req.id);
    notify(db, student, 'revoked', `Approval revoked: ${title}`, `The ${ROLE_LABEL[role]} revoked this approval: "${note}". Every copy now verifies as Revoked.\n\n${link(`/requests/${req.id}`)}`, req.id);
    // Close the offline gap: tell the gate right away to sync its revocation list.
    const guards = db.prepare("SELECT user_id FROM user_roles WHERE role = 'security' AND department_id = ?").pluck().all(req.department_id) as string[];
    notify(db, guards, 'gate_revoked', `Gate: pass revoked (${req.id} · ${title})`, `Do not admit on this pass. Open the gate app and tap Sync now.\n\n${link('/gate')}`, req.id);
  })();

  await anchorRevocation(db, svc, req.id);
}

/** Write a pending revocation to the chain. Never throws; failures are retried by processQueue. */
export async function anchorRevocation(db: DB, svc: Services, requestId: string) {
  const r = db.prepare('SELECT doc_hash, reason_code, anchor_status FROM revocations WHERE request_id = ?').get(requestId) as
    | { doc_hash: string; reason_code: number; anchor_status: string }
    | undefined;
  if (!r || r.anchor_status !== 'pending' || !svc.chain) return;
  const done = (txHash: string | null) =>
    db.transaction(() => {
      db.prepare("UPDATE revocations SET anchor_status = 'anchored', tx_hash = COALESCE(?, tx_hash), anchored_at = ?, last_error = NULL WHERE request_id = ?").run(txHash, new Date().toISOString(), requestId);
      audit(db, requestId, null, 'revocation_anchored', null, { txHash });
    })();
  try {
    done(await svc.chain.revoke(r.doc_hash, r.reason_code));
  } catch (e) {
    const already = await svc.chain.get(r.doc_hash).then((x) => x.status === 'revoked').catch(() => false);
    if (already) return done(null);
    db.prepare('UPDATE revocations SET attempts = attempts + 1, last_error = ? WHERE request_id = ?').run(((e as Error).message ?? '').slice(0, 300), requestId);
  }
}

export function revocationInfo(db: DB, requestId: string): RequestDetail['revocation'] {
  const r = db
    .prepare('SELECT r.version, r.role, r.reason, r.created_at, r.anchor_status, u.name FROM revocations r JOIN users u ON u.id = r.actor_id WHERE r.request_id = ?')
    .get(requestId) as { version: number; role: Role; reason: string; created_at: string; anchor_status: string; name: string } | undefined;
  return r ? { version: r.version, role: r.role, roleLabel: ROLE_LABEL[r.role], name: r.name, reason: r.reason, at: r.created_at, anchored: r.anchor_status === 'anchored' } : null;
}

/**
 * Everything a gate device must refuse offline: every version of a revoked request, and every version that a
 * newer anchored version has superseded. Signed with the issuer key so a tampered list is detected.
 */
export async function revocationList(db: DB): Promise<{ list: RevocationList; signature: string }> {
  const revoked = db
    .prepare('SELECT s.request_id AS rid, s.version AS v, s.doc_hash AS hash, r.created_at AS at FROM seals s JOIN revocations r ON r.request_id = s.request_id ORDER BY s.request_id, s.version')
    .all() as Omit<RevocationEntry, 'status'>[];
  const superseded = db
    .prepare(
      `SELECT s.request_id AS rid, s.version AS v, s.doc_hash AS hash, n.anchored_at AS at
         FROM seals s JOIN seals n ON n.request_id = s.request_id AND n.version = s.version + 1 AND n.anchor_status = 'anchored'
        WHERE s.request_id NOT IN (SELECT request_id FROM revocations)
        ORDER BY s.request_id, s.version`,
    )
    .all() as Omit<RevocationEntry, 'status'>[];
  const list: RevocationList = {
    issuedAt: new Date().toISOString(),
    entries: [...revoked.map((e) => ({ ...e, status: 'revoked' as const })), ...superseded.map((e) => ({ ...e, status: 'superseded' as const }))],
  };
  const { privateKey } = await issuerKey(db);
  return { list, signature: await signJson(list, privateKey) };
}

// ---------- version history ----------

/** Every version of a request: its chain state and who approved it (and on which version they actually signed). */
export function history(db: DB, svc: Services, requestId: string): VersionHistory[] {
  const req = db.prepare('SELECT status, current_version FROM requests WHERE id = ?').get(requestId) as { status: string; current_version: number };
  const revokedHash = db.prepare('SELECT doc_hash FROM revocations WHERE request_id = ?').pluck().get(requestId) as string | undefined;
  const versions = db.prepare('SELECT version, reason, created_at FROM request_versions WHERE request_id = ? ORDER BY version').all(requestId) as {
    version: number; reason: string | null; created_at: string;
  }[];
  return versions.map((v) => {
    const s = db.prepare('SELECT * FROM seals WHERE request_id = ? AND version = ?').get(requestId, v.version) as SealRow | undefined;
    const rows = db
      .prepare(
        `SELECT a.role, a.decision, a.signed_at, a.version, u.name, src.version AS src_version, src.signed_at AS src_signed_at
           FROM approvals a JOIN users u ON u.id = a.assignee_id LEFT JOIN approvals src ON src.id = a.carried_from
          WHERE a.request_id = ? AND a.version = ? AND a.round = (SELECT MAX(round) FROM approvals WHERE request_id = ? AND version = ?)
          ORDER BY a.step_no, a.id`,
      )
      .all(requestId, v.version, requestId, v.version) as { role: Role; decision: Decision; signed_at: string | null; version: number; name: string; src_version: number | null; src_signed_at: string | null }[];
    let state: VersionHistory['state'];
    if (s) state = revokedHash ? 'revoked' : s.anchor_status === 'pending' ? 'sealing' : s.chain_status;
    else state = v.version === req.current_version && req.status !== 'revoked' ? 'in_review' : 'abandoned';
    return {
      version: v.version,
      reason: v.reason,
      createdAt: v.created_at,
      state,
      docHash: s?.doc_hash ?? null,
      txHash: s?.tx_hash ?? null,
      txUrl: svc.chain?.txUrl(s?.tx_hash ?? null) ?? null,
      sealedAt: s?.anchored_at ?? s?.created_at ?? null,
      approvals: rows.map((a) => ({
        role: a.role,
        roleLabel: ROLE_LABEL[a.role],
        name: a.name,
        decision: a.decision,
        signedVersion: a.decision === 'carried' ? a.src_version! : a.version,
        carried: a.decision === 'carried',
        signedAt: a.decision === 'carried' ? a.src_signed_at : a.signed_at,
      })),
    };
  });
}
