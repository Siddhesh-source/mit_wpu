import { describe, it, expect } from 'vitest';
import { setup, RIYA_EVENT } from './helpers.js';

const roles = (d: any, decision: string) => d.timeline.filter((s: any) => s.decision === decision).map((s: any) => s.role).sort();
const emails = (db: any, kind: string) => db.prepare('SELECT to_user, subject FROM outbox WHERE kind = ? ORDER BY id').all(kind) as { to_user: string; subject: string }[];

describe('resubmit after a return: only the right people review again', () => {
  it('no change: only the approver who returned it (and later steps) review; earlier approvals are kept', async () => {
    const ctx = await setup();
    const id = (await ctx.as('u_riya').post('/api/requests', { type: 'event_permission', form: RIYA_EVENT })).body.id;
    await ctx.act('u_mehta', id, 'approved');
    await ctx.act('u_pawar', id, 'approved');
    await ctx.act('u_kulkarni', id, 'returned', { comment: 'Confirm the purpose with the club' });
    const d = (await ctx.as('u_riya').post(`/api/requests/${id}/resubmit`, { form: RIYA_EVENT })).body;
    expect(roles(d, 'pending')).toEqual(['hod']);
    expect(roles(d, 'waiting')).toEqual(['dean_sa']);
    expect(roles(d, 'carried')).toEqual(['faculty_coordinator', 'security']);
    expect((await ctx.as('u_mehta').get('/api/inbox')).body).toHaveLength(0);

    await ctx.act('u_kulkarni', id, 'approved');
    await ctx.act('u_rao', id, 'approved');
    const sealed = (await ctx.as('u_riya').get(`/api/requests/${id}`)).body;
    expect(sealed.status).toBe('sealed');
    // the kept approvals are the original signatures from before the return
    const v = (await ctx.pub(`/api/verify/hash/${sealed.seal.docHash}`)).body;
    expect(v.signers.map((s: any) => [s.role, s.carried])).toEqual([
      ['faculty_coordinator', true],
      ['hod', false],
      ['security', true],
      ['dean_sa', false],
    ]);
  });

  it('a change that affects an earlier approver sends it back to them too', async () => {
    const ctx = await setup();
    const id = (await ctx.as('u_riya').post('/api/requests', { type: 'event_permission', form: RIYA_EVENT })).body.id;
    await ctx.act('u_mehta', id, 'approved');
    await ctx.act('u_pawar', id, 'approved');
    await ctx.act('u_kulkarni', id, 'returned', { comment: 'Hall B is under repair' });
    const d = (await ctx.as('u_riya').post(`/api/requests/${id}/resubmit`, { form: { ...RIYA_EVENT, venue: 'Main Auditorium' } })).body;
    expect(roles(d, 'pending')).toEqual(['faculty_coordinator']); // venue matters to the coordinator
    expect(roles(d, 'waiting')).toEqual(['dean_sa', 'hod']);
    expect(roles(d, 'carried')).toEqual(['security']); // venue does not change Security's check
    const log = ctx.db.prepare("SELECT details_json FROM audit_log WHERE action = 'resubmitted'").pluck().get() as string;
    expect(JSON.parse(log)).toMatchObject({ changed: ['venue'], kept: ['security'] });
  });
});

describe('reopen a rejected request', () => {
  it('the rejecting approver, HoD or Dean can reopen it; the student edits and resubmits', async () => {
    const ctx = await setup();
    const id = (await ctx.as('u_riya').post('/api/requests', { type: 'event_permission', form: RIYA_EVENT })).body.id;
    await ctx.act('u_mehta', id, 'rejected', { comment: 'Clashes with exams' });
    const reopen = (user: string, body: object = {}) => ctx.as(user).post(`/api/requests/${id}/reopen`, { reason: 'Exams moved; resubmit with the new date', pin: '1234', ...body });

    expect((await reopen('u_pawar')).status).toBe(403); // not the rejecter, not senior
    expect((await reopen('u_riya')).status).toBe(403);
    expect((await reopen('u_mehta', { pin: '0000' })).status).toBe(401);
    expect((await reopen('u_mehta', { reason: ' ' })).status).toBe(400);
    const res = await reopen('u_mehta');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('returned');
    expect(res.body.reopened).toMatchObject({ role: 'faculty_coordinator', name: 'Prof. Mehta', reason: 'Exams moved; resubmit with the new date' });
    expect(emails(ctx.db, 'reopened').map((e) => e.to_user)).toEqual(['u_riya']);
    expect((await reopen('u_mehta')).status).toBe(409); // not rejected any more

    const d = (await ctx.as('u_riya').post(`/api/requests/${id}/resubmit`, { form: { ...RIYA_EVENT, date: '2026-11-19' } })).body;
    expect(d.status).toBe('in_review');
    expect(roles(d, 'pending')).toEqual(['faculty_coordinator']);
    expect(d.reopened).toBeNull();
  });

  it('the HoD can reopen something the Dean rejected', async () => {
    const ctx = await setup();
    const id = (await ctx.as('u_riya').post('/api/requests', { type: 'bonafide', form: { title: 'Visa' } })).body.id;
    await ctx.act('u_kulkarni', id, 'approved');
    await ctx.act('u_rao', id, 'rejected', { comment: 'Wrong office' });
    expect((await ctx.as('u_kulkarni').post(`/api/requests/${id}/reopen`, { reason: 'Address it to the consulate', pin: '1234' })).status).toBe(200);
    const d = (await ctx.as('u_riya').post(`/api/requests/${id}/resubmit`, { form: { title: 'Visa', addressed_to: 'Consulate' } })).body;
    expect(roles(d, 'pending')).toEqual(['hod']); // addressed_to matters to the HoD too
  });
});

describe('discussion on a request', () => {
  it('student and approvers talk on the request; the right people are emailed; outsiders cannot read it', async () => {
    const ctx = await setup();
    const id = (await ctx.as('u_riya').post('/api/requests', { type: 'event_permission', form: RIYA_EVENT })).body.id;
    await ctx.act('u_mehta', id, 'approved');
    await ctx.act('u_kulkarni', id, 'returned', { comment: 'Which hall exactly?' });

    expect((await ctx.as('u_riya').post(`/api/requests/${id}/comments`, { body: 'Hall B, ground floor. Is the 120 limit fine?' })).status).toBe(201);
    // the returner hears about it (nobody holds it while it is returned)
    expect(emails(ctx.db, 'comment').map((e) => e.to_user)).toEqual(['u_kulkarni']);
    const thread = (await ctx.as('u_kulkarni').post(`/api/requests/${id}/comments`, { body: 'Yes, fine. Please attach the booking.' })).body;
    expect(thread.map((c: any) => [c.author.name, c.author.roleLabel, c.body])).toEqual([
      ['Riya', 'Student', 'Hall B, ground floor. Is the 120 limit fine?'],
      ['Prof. Kulkarni', 'HoD', 'Yes, fine. Please attach the booking.'],
    ]);
    expect(emails(ctx.db, 'comment').map((e) => e.to_user)).toEqual(['u_kulkarni', 'u_riya']);
    expect((await ctx.as('u_riya').get(`/api/requests/${id}`)).body.commentCount).toBe(2);

    // while in review, a student message reaches whoever holds it now: the HoD (who returned it) and Security,
    // who had not approved before the return
    await ctx.as('u_riya').post(`/api/requests/${id}/resubmit`, { form: RIYA_EVENT });
    await ctx.as('u_riya').post(`/api/requests/${id}/comments`, { body: 'Booking attached by email to the office.' });
    expect(emails(ctx.db, 'comment').slice(2).map((e) => e.to_user).sort()).toEqual(['u_kulkarni', 'u_pawar']);

    expect((await ctx.as('u_riya').post(`/api/requests/${id}/comments`, { body: '   ' })).status).toBe(400);
    expect((await ctx.as('u_rao').get(`/api/requests/${id}/comments`)).status).toBe(200); // on the chain
    expect((await ctx.pub(`/api/requests/${id}/comments`)).status).toBe(401);
    const bf = (await ctx.as('u_riya').post('/api/requests', { type: 'bonafide', form: { title: 'Visa' } })).body.id;
    expect((await ctx.as('u_pawar').get(`/api/requests/${bf}/comments`)).status).toBe(403); // Security is not on a bonafide
  });
});
