import { describe, it, expect } from 'vitest';
import { decodePass, encodePass, sha256Hex, verifyPass, passFromText } from '@plc/shared';
import { setup, RIYA_EVENT, rpcUrl } from './helpers.js';
import { processQueue } from '../src/seal.js';
import { issuerKey } from '../src/keys.js';

const pdfOf = async (req: any) => {
  const res = await req.buffer(true).parse((r: any, cb: any) => {
    const chunks: Buffer[] = [];
    r.on('data', (c: Buffer) => chunks.push(c));
    r.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  return res;
};

describe('sealing on full approval', () => {
  it('seals v1: PDF stored, SHA-256 anchored on chain, request sealed', async () => {
    const { as, approvedEvent, chain } = await setup();
    const id = await approvedEvent();
    const d = (await as('u_riya').get(`/api/requests/${id}`)).body;
    expect(d.status).toBe('sealed');
    expect(d.seal).toMatchObject({ version: 1, anchor: 'anchored', chainStatus: 'active' });
    expect(d.seal.txHash).toMatch(/^0x[0-9a-f]{64}$/);

    const rec = await chain.get(d.seal.docHash);
    expect(rec).toMatchObject({ status: 'active', requestId: id, docType: 'event_permission', version: 1, prevHash: null });
    // Valid only on the event date, 00:00 to 23:59:59 IST
    expect(rec.validFrom).toBe(Date.parse('2026-11-05T00:00:00+05:30') / 1000);
    expect(rec.validUntil - rec.validFrom).toBe(86399);
  });

  it('the downloaded PDF hashes to the anchored value; one flipped byte does not', async () => {
    const { as, approvedEvent, pub } = await setup();
    const id = await approvedEvent();
    const d = (await as('u_riya').get(`/api/requests/${id}`)).body;
    const res = await pdfOf(as('u_riya').get(`/api/requests/${id}/pdf`));
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain(`${id}-v1.pdf`);
    const bytes: Buffer = res.body;
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(sha256Hex(bytes)).toBe(d.seal.docHash);

    const ok = (await pub(`/api/verify/hash/${sha256Hex(bytes)}`)).body;
    expect(ok.status).toBe('verified');

    const tampered = Buffer.from(bytes);
    tampered[Math.floor(tampered.length / 2)] ^= 0x01;
    expect(sha256Hex(tampered)).not.toBe(d.seal.docHash);
    expect((await pub(`/api/verify/hash/${sha256Hex(tampered)}`)).body.status).toBe('not_found');
  });

  it('verify by hash and by (request, version) returns roles and times but no personal data', async () => {
    const { approvedEvent, pub, as } = await setup();
    const id = await approvedEvent();
    const hash = (await as('u_riya').get(`/api/requests/${id}`)).body.seal.docHash;
    const v = (await pub(`/api/verify/hash/0x${hash.toUpperCase()}`)).body;
    expect(v).toMatchObject({ status: 'verified', requestId: id, version: 1, type: 'event_permission', typeName: 'Event permission', source: 'chain', network: 'local' });
    expect(v.signers.map((s: any) => s.role)).toEqual(['faculty_coordinator', 'hod', 'security', 'dean_sa']);
    expect(v.signers.every((s: any) => s.signedAt && s.version === 1 && !s.carried)).toBe(true);
    const json = JSON.stringify(v);
    for (const personal of ['Riya', 'Mehta', 'Kulkarni', 'Rao', 'Pawar', 'Hall B', 'CSE']) expect(json).not.toContain(personal);

    expect((await pub(`/api/verify/ref/${id}/1`)).body).toEqual(v.status === 'verified' ? { ...v, docHash: hash } : v);
    expect((await pub(`/api/verify/ref/${id}/9`)).body.status).toBe('not_found');
    expect((await pub('/api/verify/hash/not-a-hash')).body.status).toBe('not_found');
  });

  it('the QR pass carries the essentials and an Ed25519 signature that verifies with the public key', async () => {
    const { approvedEvent, db, pub } = await setup();
    const id = await approvedEvent();
    const pass = db.prepare('SELECT pass FROM seals WHERE request_id = ?').pluck().get(id) as string;
    const { publicKey } = (await pub('/api/issuer-public-key')).body;
    const { ok, payload } = await verifyPass(pass, publicKey);
    expect(ok).toBe(true);
    expect(payload).toMatchObject({
      rid: id, v: 1, t: 'event_permission', ti: 'Robotics fest', n: 'Riya', d: 'Computer Science and Engineering', dt: '2026-11-05', ve: 'Hall B',
      vf: Date.parse('2026-11-05T00:00:00+05:30') / 1000,
    });
    expect(passFromText(`http://verify.test/verify#p=${pass}`)).toBe(pass);

    // Change the venue and re-encode the body with the old signature: must fail
    const forged = { ...decodePass(pass)!.payload, ve: 'Main Auditorium' };
    const body = Buffer.from(JSON.stringify(forged)).toString('base64url');
    expect((await verifyPass(`${body}.${pass.split('.')[1]}`, publicKey)).ok).toBe(false);
    // A pass signed by some other key fails too
    const other = await encodePass(forged, '1'.repeat(64));
    expect((await verifyPass(other, publicKey)).ok).toBe(false);
    expect((await verifyPass('garbage', publicKey)).ok).toBe(false);
  });

  it('non-event documents are valid for a year from issue', async () => {
    const { as, act, db } = await setup();
    const id = (await as('u_riya').post('/api/requests', { type: 'bonafide', form: { title: 'Scholarship' } })).body.id;
    await act('u_kulkarni', id, 'approved');
    await act('u_rao', id, 'approved');
    const s = db.prepare('SELECT valid_from, valid_until FROM seals WHERE request_id = ?').get(id) as any;
    expect(s.valid_until - s.valid_from).toBe(365 * 86400);
    expect(Math.abs(s.valid_from - Date.now() / 1000)).toBeLessThan(60);
  });

  it('PDF download is private: owner, chain members and admin only', async () => {
    const { as, approvedEvent, pub } = await setup();
    const id = await approvedEvent();
    expect((await pub(`/api/requests/${id}/pdf`)).status).toBe(401);
    expect((await as('u_admin').get(`/api/requests/${id}/pdf`)).status).toBe(200);
    expect((await as('u_kulkarni').get(`/api/requests/${id}/pdf`)).status).toBe(200);
    const pending = (await as('u_riya').post('/api/requests', { type: 'bonafide', form: { title: 'Visa' } })).body.id;
    expect((await as('u_riya').get(`/api/requests/${pending}/pdf`)).status).toBe(404);
  });
});

describe('queue-and-retry anchoring', () => {
  it('keeps the seal pending while the chain is down, then anchors on retry', async () => {
    const { as, approvedEvent, chain, db, svc, pub } = await setup({ rpcUrl: 'http://127.0.0.1:9' });
    const id = await approvedEvent();
    let d = (await as('u_riya').get(`/api/requests/${id}`)).body;
    expect(d.status).toBe('sealing');
    expect(d.seal).toMatchObject({ anchor: 'pending', txHash: null });
    const row = db.prepare('SELECT attempts, last_error FROM seals WHERE request_id = ?').get(id) as any;
    expect(row.attempts).toBe(1);
    expect(row.last_error).toBeTruthy();
    // Never "verified" before it is on chain
    expect((await pub(`/api/verify/hash/${d.seal.docHash}`)).body.status).toBe('pending');

    chain.useRpc((await import('./helpers.js')).rpcUrl());
    await processQueue(db, svc);
    d = (await as('u_riya').get(`/api/requests/${id}`)).body;
    expect(d.status).toBe('sealed');
    expect(d.seal.anchor).toBe('anchored');
    expect((await pub(`/api/verify/hash/${d.seal.docHash}`)).body.status).toBe('verified');
  });

  it('the issuer key is stable across calls', async () => {
    const { db } = await setup();
    expect((await issuerKey(db)).publicKey).toBe((await issuerKey(db)).publicKey);
  });
});

void RIYA_EVENT;

describe('chain restart', () => {
  it('redeploys and replays stored seals when the contract disappears', async () => {
    const { startLocalNode } = await import('@plc/contracts');
    const { ChainClient, dbAddressStore } = await import('../src/chain.js');
    const { replayAll } = await import('../src/seal.js');
    let node = await startLocalNode(8631);
    try {
      // Same shape as production: remembered address + replay hook
      const ctx = await setup({
        chain: (db) => new ChainClient({
          network: 'local', rpcUrl: node.url, privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
          store: dbAddressStore(db, 'local'), onFreshDeploy: () => replayAll(db),
        }),
      });
      const id = await ctx.approvedEvent();
      const hash = ctx.db.prepare('SELECT doc_hash FROM seals WHERE request_id = ?').pluck().get(id) as string;
      expect((await ctx.chain.get(hash)).status).toBe('active');

      await node.stop();
      node = await startLocalNode(8631); // empty chain, same port
      await processQueue(ctx.db, ctx.svc);
      expect((await ctx.chain.get(hash)).status).toBe('active');
      expect(ctx.db.prepare('SELECT anchor_status FROM seals WHERE request_id = ?').pluck().get(id)).toBe('anchored');
    } finally {
      await node.stop();
    }
  }, 60_000);
});

describe('one contract per database', () => {
  it('a fresh database deploys its own contract, so request ids never clash with an old run', async () => {
    const { ChainClient, dbAddressStore } = await import('../src/chain.js');
    const { HDNodeWallet } = await import('ethers');
    const key = HDNodeWallet.fromPhrase('test test test test test test test test test test test junk', undefined, "m/44'/60'/0'/0/19").privateKey;
    const make = (db: any) => new ChainClient({ network: 'local', rpcUrl: rpcUrl(), privateKey: key, store: dbAddressStore(db, 'local') });
    const a = await setup({ chain: make });
    const b = await setup({ chain: make });
    const idA = await a.approvedEvent();
    const idB = await b.approvedEvent();
    expect(idA).toBe(idB); // both PLC-YYYY-0001
    expect(await a.chain.address()).not.toBe(await b.chain.address());
    expect((await b.as('u_riya').get(`/api/requests/${idB}`)).body.status).toBe('sealed');
    // the address is remembered: a new client on the same database reuses it
    expect(await make(a.db).address()).toBe(await a.chain.address());
  });
});
