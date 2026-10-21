import { describe, it, expect } from 'vitest';
import { canonicalJson, verifyJson } from '@plc/shared';
import { setup, RIYA_EVENT } from './helpers.js';

const pendingRoles = (detail: any) => detail.timeline.filter((s: any) => s.decision === 'pending').map((s: any) => s.role).sort();

describe('catalogue', () => {
  it('lists the request types with the event chain from the deck', async () => {
    const { as } = await setup();
    const types = (await as('u_riya').get('/api/request-types')).body;
    expect(types.map((t: any) => t.code)).toEqual(['event_permission', 'on_duty', 'bonafide', 'no_dues']);
    expect(types[0].chain.map(({ stepNo, role }: any) => ({ stepNo, role }))).toEqual([
      { stepNo: 1, role: 'faculty_coordinator' },
      { stepNo: 2, role: 'hod' },
      { stepNo: 2, role: 'security' },
      { stepNo: 3, role: 'dean_sa' },
    ]);
    // Date or venue changes go back to the coordinator and HoD only
    const byDate = types[0].chain.filter((s: any) => s.affectedBy.includes('date') || s.affectedBy.includes('venue')).map((s: any) => s.role);
    expect(byDate).toEqual(['faculty_coordinator', 'hod']);
  });
});

describe("Riya's event permission", () => {
  it('routes coordinator → HoD ‖ Security → Dean SA → approved', async () => {
    const { as, act } = await setup();
    const sub = await as('u_riya').post('/api/requests', { type: 'event_permission', form: RIYA_EVENT });
    expect(sub.status).toBe(201);
    const id = sub.body.id;
    expect(id).toMatch(/^PLC-\d{4}-0001$/);
    expect(sub.body.status).toBe('in_review');
    expect(pendingRoles(sub.body)).toEqual(['faculty_coordinator']);
    expect(sub.body.timeline.map((s: any) => s.assignee.name)).toEqual(['Prof. Mehta', 'Prof. Kulkarni', 'Mr. Pawar', 'Dr. Rao']);

    // Only the coordinator sees it first
    expect((await as('u_kulkarni').get('/api/inbox')).body).toHaveLength(0);
    expect((await act('u_mehta', id, 'approved')).status).toBe(200);

    let d = (await as('u_riya').get(`/api/requests/${id}`)).body;
    expect(pendingRoles(d)).toEqual(['hod', 'security']);
    expect(d.withNow.map((w: any) => w.name).sort()).toEqual(['Mr. Pawar', 'Prof. Kulkarni']);

    // Dean SA cannot act before step 2 completes
    const deanRow = d.timeline.find((s: any) => s.role === 'dean_sa');
    expect((await as('u_rao').post(`/api/approvals/${deanRow.approvalId}/decide`, { decision: 'approved', pin: '1234' })).status).toBe(409);
    expect((await as('u_rao').get('/api/inbox')).body).toHaveLength(0);

    await act('u_pawar', id, 'approved');
    d = (await as('u_riya').get(`/api/requests/${id}`)).body;
    expect(pendingRoles(d)).toEqual(['hod']); // still waiting on the parallel partner

    await act('u_kulkarni', id, 'approved');
    d = (await as('u_riya').get(`/api/requests/${id}`)).body;
    expect(pendingRoles(d)).toEqual(['dean_sa']);

    await act('u_rao', id, 'approved');
    d = (await as('u_riya').get(`/api/requests/${id}`)).body;
    expect(d.status).toBe('sealed'); // approved, then sealed and anchored straight away
    expect(d.timeline.every((s: any) => s.decision === 'approved' && s.signedAt)).toBe(true);
  });

  it('signs every decision with the issuer key over the form hash', async () => {
    const { as, act, db } = await setup();
    const id = (await as('u_riya').post('/api/requests', { type: 'event_permission', form: RIYA_EVENT })).body.id;
    await act('u_mehta', id, 'approved');
    const row = db.prepare("SELECT * FROM approvals WHERE request_id = ? AND role = 'faculty_coordinator'").get(id) as any;
    const formHash = db.prepare('SELECT form_hash FROM request_versions WHERE request_id = ?').pluck().get(id);
    const { publicKey } = (await as('u_riya').get('/api/issuer-public-key')).body;
    const payload = { requestId: id, version: 1, role: 'faculty_coordinator', approverId: 'u_mehta', decision: 'approved', formHash, signedAt: row.signed_at };
    expect(await verifyJson(payload, row.signature, publicKey)).toBe(true);
    expect(await verifyJson({ ...payload, decision: 'rejected' }, row.signature, publicKey)).toBe(false);
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
  });

  it('a reject stops the chain', async () => {
    const { as, act } = await setup();
    const id = (await as('u_riya').post('/api/requests', { type: 'event_permission', form: RIYA_EVENT })).body.id;
    await act('u_mehta', id, 'approved');
    expect((await act('u_kulkarni', id, 'rejected', { comment: 'Clashes with exams' })).status).toBe(200);
    const d = (await as('u_riya').get(`/api/requests/${id}`)).body;
    expect(d.status).toBe('rejected');
    expect(d.lastComment).toEqual({ role: 'hod', decision: 'rejected', comment: 'Clashes with exams', version: 1 });
    expect((await as('u_pawar').get('/api/inbox')).body).toHaveLength(0);
    expect(pendingRoles(d)).toEqual([]);
  });

  it('return then resubmit restarts the chain with the edited form', async () => {
    const { as, act } = await setup();
    const id = (await as('u_riya').post('/api/requests', { type: 'event_permission', form: RIYA_EVENT })).body.id;
    await act('u_mehta', id, 'approved');
    await act('u_kulkarni', id, 'returned', { comment: 'Add the expected headcount correctly' });
    let d = (await as('u_riya').get(`/api/requests/${id}`)).body;
    expect(d.status).toBe('returned');
    expect(d.lastComment.comment).toBe('Add the expected headcount correctly');

    const re = await as('u_riya').post(`/api/requests/${id}/resubmit`, { form: { ...RIYA_EVENT, headcount: 150 } });
    expect(re.status).toBe(200);
    d = re.body;
    expect(d.status).toBe('in_review');
    expect(d.form.headcount).toBe(150);
    expect(pendingRoles(d)).toEqual(['faculty_coordinator']);
    expect(d.timeline).toHaveLength(4);
    // cannot resubmit again while in review
    expect((await as('u_riya').post(`/api/requests/${id}/resubmit`, { form: RIYA_EVENT })).status).toBe(409);
  });

  it('requires a comment on return or reject', async () => {
    const { as, act } = await setup();
    const id = (await as('u_riya').post('/api/requests', { type: 'event_permission', form: RIYA_EVENT })).body.id;
    expect((await act('u_mehta', id, 'returned', { comment: '' })).status).toBe(400);
  });
});

describe('other chains', () => {
  it('on-duty: coordinator → HoD → approved', async () => {
    const { as, act } = await setup();
    const id = (await as('u_riya').post('/api/requests', { type: 'on_duty', form: { title: 'Robotics workshop at COEP', date: '2026-11-10' } })).body.id;
    await act('u_mehta', id, 'approved');
    await act('u_kulkarni', id, 'approved');
    expect((await as('u_riya').get(`/api/requests/${id}`)).body.status).toBe('sealed');
  });

  it('bonafide: HoD → Dean SA → approved', async () => {
    const { as, act } = await setup();
    const id = (await as('u_riya').post('/api/requests', { type: 'bonafide', form: { title: 'Scholarship' } })).body.id;
    expect((await as('u_mehta').get('/api/inbox')).body).toHaveLength(0);
    await act('u_kulkarni', id, 'approved');
    await act('u_rao', id, 'approved');
    expect((await as('u_riya').get(`/api/requests/${id}`)).body.status).toBe('sealed');
  });
});

describe('guards and validation', () => {
  it('refuses a wrong PIN and someone else’s approval', async () => {
    const { as, act } = await setup();
    const id = (await as('u_riya').post('/api/requests', { type: 'event_permission', form: RIYA_EVENT })).body.id;
    expect((await act('u_mehta', id, 'approved', { pin: '9999' })).status).toBe(401);
    const item = (await as('u_mehta').get('/api/inbox')).body[0];
    expect((await as('u_kulkarni').post(`/api/approvals/${item.approvalId}/decide`, { decision: 'approved', pin: '1234' })).status).toBe(404);
    expect((await as('u_mehta').post(`/api/approvals/${item.approvalId}/decide`, { decision: 'maybe', pin: '1234' })).status).toBe(400);
  });

  it('a student cannot read a request they are not part of; an unrelated approver cannot either', async () => {
    const { as, db, login } = await setup();
    db.prepare("INSERT INTO users (id, name, title, department_id, pin_hash) SELECT 'u_amit', 'Amit', 'CSE, 3rd year', 'cse', pin_hash FROM users WHERE id = 'u_riya'").run();
    db.prepare("INSERT INTO user_roles VALUES ('u_amit', 'student', 'cse')").run();
    await login('u_amit');
    const id = (await as('u_riya').post('/api/requests', { type: 'bonafide', form: { title: 'Visa' } })).body.id;
    expect((await as('u_amit').get(`/api/requests/${id}`)).status).toBe(403);
    expect((await as('u_pawar').get(`/api/requests/${id}`)).status).toBe(403); // Security is not on the bonafide chain
    expect((await as('u_admin').get(`/api/requests/${id}`)).status).toBe(200);
    expect((await as('u_kulkarni').get(`/api/requests/${id}`)).status).toBe(200);
  });

  it('only students submit; required fields and formats are enforced', async () => {
    const { as } = await setup();
    expect((await as('u_kulkarni').post('/api/requests', { type: 'event_permission', form: RIYA_EVENT })).status).toBe(403);
    expect((await as('u_riya').post('/api/requests', { type: 'nope', form: {} })).status).toBe(400);
    const noVenue = await as('u_riya').post('/api/requests', { type: 'event_permission', form: { ...RIYA_EVENT, venue: ' ' } });
    expect(noVenue.status).toBe(400);
    expect(noVenue.body.error).toBe('Venue is required');
    expect((await as('u_riya').post('/api/requests', { type: 'event_permission', form: { ...RIYA_EVENT, date: '5 Nov' } })).status).toBe(400);
    expect((await as('u_riya').post('/api/requests', { type: 'event_permission', form: { ...RIYA_EVENT, headcount: 'lots' } })).status).toBe(400);
  });

  it('lists my requests, newest first, with who has it now', async () => {
    const { as } = await setup();
    await as('u_riya').post('/api/requests', { type: 'bonafide', form: { title: 'Visa' } });
    await as('u_riya').post('/api/requests', { type: 'event_permission', form: RIYA_EVENT });
    const mine = (await as('u_riya').get('/api/requests/mine')).body;
    expect(mine).toHaveLength(2);
    expect(mine.map((m: any) => m.title).sort()).toEqual(['Robotics fest', 'Visa']);
    expect(mine.find((m: any) => m.title === 'Robotics fest').withNow[0]).toMatchObject({ role: 'faculty_coordinator', name: 'Prof. Mehta' });
  });
});

describe('audit log', () => {
  it('records every action with actor and version', async () => {
    const { as, act, db } = await setup();
    const id = (await as('u_riya').post('/api/requests', { type: 'on_duty', form: { title: 'Seminar', date: '2026-11-10' } })).body.id;
    await act('u_mehta', id, 'returned', { comment: 'Wrong date' });
    await as('u_riya').post(`/api/requests/${id}/resubmit`, { form: { title: 'Seminar', date: '2026-11-11' } });
    await act('u_mehta', id, 'approved');
    await act('u_kulkarni', id, 'approved');
    const log = db.prepare('SELECT action, actor_id, version FROM audit_log WHERE request_id = ? ORDER BY id').all(id);
    expect(log).toEqual([
      { action: 'submitted', actor_id: 'u_riya', version: 1 },
      { action: 'returned', actor_id: 'u_mehta', version: 1 },
      { action: 'resubmitted', actor_id: 'u_riya', version: 1 },
      { action: 'approved', actor_id: 'u_mehta', version: 1 },
      { action: 'approved', actor_id: 'u_kulkarni', version: 1 },
      { action: 'fully_approved', actor_id: null, version: 1 },
      { action: 'sealed', actor_id: null, version: 1 },
      { action: 'anchored', actor_id: null, version: 1 },
    ]);
  });
});
