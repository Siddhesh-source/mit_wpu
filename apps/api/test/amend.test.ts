import { describe, it, expect } from 'vitest';
import { setup, RIYA_EVENT } from './helpers.js';

const NEW_PLAN = { date: '2026-11-12', venue: 'Main Auditorium' };
const by = (d: any, decision: string) => d.timeline.filter((s: any) => s.decision === decision).map((s: any) => s.role).sort();

describe('amendment flow: the plan changed', () => {
  it('date + venue change goes back to the coordinator and HoD only; Security and Dean SA are carried', async () => {
    const { as, approvedEvent, db, pub } = await setup();
    const id = await approvedEvent();
    const v1Hash = (await as('u_riya').get(`/api/requests/${id}`)).body.seal.docHash;

    const res = await as('u_riya').post(`/api/requests/${id}/amend`, { changes: NEW_PLAN, reason: 'Hall B under repair; moved a week later' });
    expect(res.status).toBe(200);
    const d = res.body;
    expect(d.status).toBe('amending');
    expect(d.version).toBe(2);
    expect(d.form).toMatchObject({ ...RIYA_EVENT, ...NEW_PLAN });
    expect(d.amendment).toMatchObject({ fromVersion: 1, reason: 'Hall B under repair; moved a week later', changed: ['date', 'venue'] });
    expect(d.amendment.previous.venue).toBe('Hall B');
    expect(by(d, 'pending')).toEqual(['faculty_coordinator']);
    expect(by(d, 'waiting')).toEqual(['hod']);
    expect(by(d, 'carried')).toEqual(['dean_sa', 'security']);
    expect(d.timeline.filter((s: any) => s.decision === 'carried').every((s: any) => s.carriedFromVersion === 1)).toBe(true);

    // Carried rows point at the exact v1 approvals
    const carried = db.prepare("SELECT role, carried_from FROM approvals WHERE request_id = ? AND decision = 'carried'").all(id) as any[];
    for (const c of carried) {
      const src = db.prepare('SELECT role, version, decision FROM approvals WHERE id = ?').get(c.carried_from) as any;
      expect(src).toEqual({ role: c.role, version: 1, decision: 'approved' });
    }
    // Security and Dean SA have nothing to do
    expect((await as('u_pawar').get('/api/inbox')).body).toHaveLength(0);
    expect((await as('u_rao').get('/api/inbox')).body).toHaveLength(0);
    // v1 stays valid while v2 is in review
    expect((await pub(`/api/verify/hash/${v1Hash}`)).body.status).toBe('verified');
    // the approver sees what changed
    const card = (await as('u_mehta').get('/api/inbox')).body[0];
    expect(card.amendment.changed).toEqual(['date', 'venue']);
  });

  it('after the two re-approvals, v2 is sealed and supersedes v1 on chain', async () => {
    const { as, act, approvedEvent, pub, chain } = await setup();
    const id = await approvedEvent();
    const v1Hash = (await as('u_riya').get(`/api/requests/${id}`)).body.seal.docHash;
    await as('u_riya').post(`/api/requests/${id}/amend`, { changes: NEW_PLAN, reason: 'Venue changed' });
    await act('u_mehta', id, 'approved');
    let d = (await as('u_riya').get(`/api/requests/${id}`)).body;
    expect(by(d, 'pending')).toEqual(['hod']);
    await act('u_kulkarni', id, 'approved');

    d = (await as('u_riya').get(`/api/requests/${id}`)).body;
    expect(d.status).toBe('sealed');
    expect(d.seal).toMatchObject({ version: 2, anchor: 'anchored', chainStatus: 'active' });
    expect(d.seal.validFrom).toBe(Date.parse('2026-11-12T00:00:00+05:30') / 1000);

    expect((await chain.get(v1Hash)).status).toBe('superseded');
    expect((await chain.get(v1Hash)).supersededBy).toBe(d.seal.docHash);
    expect((await chain.get(d.seal.docHash)).prevHash).toBe(v1Hash);

    const v1 = (await pub(`/api/verify/hash/${v1Hash}`)).body;
    expect(v1.status).toBe('superseded');
    expect(v1.supersededBy).toEqual({ version: 2, docHash: d.seal.docHash });
    expect(v1.latest).toEqual({ version: 2, docHash: d.seal.docHash });

    const v2 = (await pub(`/api/verify/hash/${d.seal.docHash}`)).body;
    expect(v2.status).toBe('verified');
    expect(v2.signers.map((s: any) => [s.role, s.version, s.carried])).toEqual([
      ['faculty_coordinator', 2, false],
      ['hod', 2, false],
      ['security', 1, true],
      ['dean_sa', 1, true],
    ]);
    // v2 PDF is downloadable and v1 is still kept
    expect((await as('u_riya').get(`/api/requests/${id}/pdf`)).status).toBe(200);
    expect((await as('u_riya').get(`/api/requests/${id}/pdf?v=1`)).status).toBe(200);
  });

  it('a headcount change also needs Security and Dean SA', async () => {
    const { as, approvedEvent } = await setup();
    const id = await approvedEvent();
    const d = (await as('u_riya').post(`/api/requests/${id}/amend`, { changes: { headcount: 300 }, reason: 'More registrations' })).body;
    expect(by(d, 'pending')).toEqual(['faculty_coordinator']);
    expect(by(d, 'waiting')).toEqual(['dean_sa', 'hod', 'security']);
    expect(by(d, 'carried')).toEqual([]);
  });

  it('a purpose-only change goes back to the coordinator only', async () => {
    const { as, approvedEvent } = await setup();
    const id = await approvedEvent();
    const d = (await as('u_riya').post(`/api/requests/${id}/amend`, { changes: { purpose: 'Now with a drone round' }, reason: 'Added a round' })).body;
    expect(by(d, 'pending')).toEqual(['faculty_coordinator']);
    expect(by(d, 'carried')).toEqual(['dean_sa', 'hod', 'security']);
  });

  it('refuses no-op, unknown fields, missing reason, other students and non-sealed requests', async () => {
    const { as, approvedEvent, db, login } = await setup();
    const id = await approvedEvent();
    const amend = (body: object, user = 'u_riya') => as(user).post(`/api/requests/${id}/amend`, body);
    expect((await amend({ changes: { venue: 'Hall B' }, reason: 'x' })).body.error).toBe('Nothing changed');
    expect((await amend({ changes: { budget: 10 }, reason: 'x' })).body.error).toBe('budget cannot be amended');
    expect((await amend({ changes: NEW_PLAN, reason: ' ' })).status).toBe(400);
    expect((await amend({ changes: { date: 'next week' }, reason: 'x' })).status).toBe(400);
    expect((await amend({ changes: NEW_PLAN, reason: 'x' }, 'u_kulkarni')).status).toBe(403);

    db.prepare("INSERT INTO users (id, name, title, department_id, pin_hash) SELECT 'u_amit', 'Amit', 'CSE', 'cse', pin_hash FROM users WHERE id = 'u_riya'").run();
    db.prepare("INSERT INTO user_roles VALUES ('u_amit', 'student', 'cse')").run();
    await login('u_amit');
    expect((await amend({ changes: NEW_PLAN, reason: 'x' }, 'u_amit')).status).toBe(403);

    const inReview = (await as('u_riya').post('/api/requests', { type: 'event_permission', form: RIYA_EVENT })).body.id;
    expect((await as('u_riya').post(`/api/requests/${inReview}/amend`, { changes: NEW_PLAN, reason: 'x' })).status).toBe(409);

    expect((await amend({ changes: NEW_PLAN, reason: 'x' })).status).toBe(200);
    expect((await amend({ changes: { venue: 'Hall C' }, reason: 'y' })).body.error).toBe('An amendment is already in review');
  });

  it('a return during amendment ends only the amendment: v1 stays sealed and valid, and Riya can amend again', async () => {
    const { as, act, approvedEvent, pub } = await setup();
    const id = await approvedEvent();
    const v1Hash = (await as('u_riya').get(`/api/requests/${id}`)).body.seal.docHash;
    await as('u_riya').post(`/api/requests/${id}/amend`, { changes: NEW_PLAN, reason: 'Venue changed' });
    await act('u_mehta', id, 'returned', { comment: 'Auditorium is booked that day' });

    let d = (await as('u_riya').get(`/api/requests/${id}`)).body;
    expect(d.status).toBe('sealed');
    expect(d.version).toBe(1);
    expect(d.form.venue).toBe('Hall B');
    expect(d.seal.version).toBe(1);
    expect(d.lastComment).toEqual({ role: 'faculty_coordinator', decision: 'returned', comment: 'Auditorium is booked that day', version: 2 });
    expect(d.timeline.every((s: any) => s.decision === 'approved')).toBe(true); // back to v1's chain
    expect((await pub(`/api/verify/hash/${v1Hash}`)).body.status).toBe('verified');

    // Try again with another hall; this time it goes through
    await as('u_riya').post(`/api/requests/${id}/amend`, { changes: { ...NEW_PLAN, venue: 'Seminar Hall 2' }, reason: 'Booked Seminar Hall 2' });
    await act('u_mehta', id, 'approved');
    await act('u_kulkarni', id, 'approved');
    d = (await as('u_riya').get(`/api/requests/${id}`)).body;
    expect(d.status).toBe('sealed');
    expect(d.seal.version).toBe(2);
    expect(d.form.venue).toBe('Seminar Hall 2');
    expect((await pub(`/api/verify/hash/${v1Hash}`)).body.status).toBe('superseded');
  });

  it('a second amendment makes v3; carried approvals still point at what was actually signed', async () => {
    const { as, act, approvedEvent, db, pub } = await setup();
    const id = await approvedEvent();
    await as('u_riya').post(`/api/requests/${id}/amend`, { changes: NEW_PLAN, reason: 'Moved' });
    await act('u_mehta', id, 'approved');
    await act('u_kulkarni', id, 'approved');
    await as('u_riya').post(`/api/requests/${id}/amend`, { changes: { venue: 'Hall C' }, reason: 'Moved again' });
    await act('u_mehta', id, 'approved');
    await act('u_kulkarni', id, 'approved');
    const d = (await as('u_riya').get(`/api/requests/${id}`)).body;
    expect(d.seal.version).toBe(3);
    const v3 = (await pub(`/api/verify/hash/${d.seal.docHash}`)).body;
    expect(v3.status).toBe('verified');
    expect(v3.signers.find((s: any) => s.role === 'security')).toMatchObject({ version: 1, carried: true });
    const sec = db.prepare("SELECT carried_from FROM approvals WHERE request_id = ? AND version = 3 AND role = 'security'").pluck().get(id);
    expect(db.prepare('SELECT version FROM approvals WHERE id = ?').pluck().get(sec)).toBe(1);
  });

  it('the original submit → approve → seal → verify flow is unchanged for other types', async () => {
    const { as, act, pub } = await setup();
    const id = (await as('u_riya').post('/api/requests', { type: 'on_duty', form: { title: 'Seminar', date: '2026-11-10' } })).body.id;
    await act('u_mehta', id, 'approved');
    await act('u_kulkarni', id, 'approved');
    const d = (await as('u_riya').get(`/api/requests/${id}`)).body;
    expect(d.status).toBe('sealed');
    expect(d.amendment).toBeNull();
    expect((await pub(`/api/verify/hash/${d.seal.docHash}`)).body.status).toBe('verified');
  });
});
