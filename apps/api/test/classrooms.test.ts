import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { setup } from './helpers.js';

const signupStudent = async (ctx: any, email: string) =>
  (await request(ctx.app).post('/api/auth/signup').send({ kind: 'student', name: 'Aarav Shah', email, password: 'secret12', pin: '4321', departmentId: 'cse' })).body.token as string;
const as = (ctx: any, token: string) => ({
  get: (url: string) => request(ctx.app).get(url).set('Authorization', `Bearer ${token}`),
  post: (url: string, body: object = {}) => request(ctx.app).post(url).set('Authorization', `Bearer ${token}`).send(body),
});
const mail = (db: any, kind: string) => db.prepare('SELECT to_addr, subject, body_text FROM outbox WHERE kind = ? ORDER BY id').all(kind) as { to_addr: string; subject: string; body_text: string }[];

describe('classrooms', () => {
  it('teacher creates a class, invites by registered email, the code is emailed, only the invited student can join', async () => {
    const ctx = await setup();
    const created = await ctx.as('u_mehta').post('/api/classrooms', { name: 'CSE 2A, Compilers' });
    expect(created.status).toBe(201);
    const cls = created.body;
    expect(cls.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    const aarav = await signupStudent(ctx, 'aarav@college.example');
    const other = await signupStudent(ctx, 'other@college.example');
    const inv = await ctx.as('u_mehta').post(`/api/classrooms/${cls.id}/invite`, { emails: ['Aarav@College.example', 'nobody@college.example', 'kulkarni@campus.example'] });
    expect(inv.body.results).toEqual([
      { email: 'aarav@college.example', ok: true },
      { email: 'nobody@college.example', ok: false, error: expect.stringMatching(/No account/) },
      { email: 'kulkarni@campus.example', ok: false, error: 'This is a staff account' },
    ]);
    // The code goes to the registered address only
    const sent = mail(ctx.db, 'classroom_invite');
    expect(sent).toHaveLength(1);
    expect(sent[0].to_addr).toBe('aarav@college.example');
    expect(sent[0].subject).toContain(cls.code);

    // Someone else with the code cannot join
    expect((await as(ctx, other).post('/api/classrooms/join', { code: cls.code })).status).toBe(403);
    expect((await as(ctx, aarav).post('/api/classrooms/join', { code: 'ZZZZZZ' })).status).toBe(404);
    const joined = await as(ctx, aarav).post('/api/classrooms/join', { code: cls.code.toLowerCase() });
    expect(joined.status).toBe(200);
    expect(joined.body).toMatchObject({ name: 'CSE 2A, Compilers', code: null, teacher: { id: 'u_mehta' } });
    expect((await as(ctx, aarav).post('/api/classrooms/join', { code: cls.code })).status).toBe(409);

    // Joining connects the student to the teacher
    expect((await as(ctx, aarav).get('/api/connections')).body).toEqual([expect.objectContaining({ status: 'accepted', person: expect.objectContaining({ id: 'u_mehta' }) })]);
    // Teacher sees members; the student sees the class without the code or the member list
    const teacherView = (await ctx.as('u_mehta').get('/api/classrooms')).body[0];
    expect(teacherView).toMatchObject({ joinedCount: 1, members: [expect.objectContaining({ email: 'aarav@college.example', joinedAt: expect.any(String) })] });
    expect((await as(ctx, aarav).get('/api/classrooms')).body).toEqual([expect.objectContaining({ code: null, members: [] })]);
  });

  it('only staff create classes; only the owner invites', async () => {
    const ctx = await setup();
    expect((await ctx.as('u_riya').post('/api/classrooms', { name: 'x' })).status).toBe(403);
    const cls = (await ctx.as('u_mehta').post('/api/classrooms', { name: 'Lab batch' })).body;
    expect((await ctx.as('u_kulkarni').post(`/api/classrooms/${cls.id}/invite`, { emails: ['riya@campus.example'] })).status).toBe(404);
  });
});

describe('custom request', () => {
  it('student writes their own request and picks the signers in order; it routes, signs and can be returned and resubmitted', async () => {
    const ctx = await setup();
    const form = { title: 'Late library return waiver', purpose: 'Book returned 3 days late due to illness' };
    expect((await ctx.as('u_riya').post('/api/requests', { type: 'custom', form })).status).toBe(400);
    expect((await ctx.as('u_riya').post('/api/requests', { type: 'custom', form, chain: ['hod', 'hod'] })).status).toBe(400);
    expect((await ctx.as('u_riya').post('/api/requests', { type: 'custom', form, chain: ['student'] })).status).toBe(400);

    const res = await ctx.as('u_riya').post('/api/requests', { type: 'custom', form, chain: ['librarian', 'hod'] });
    expect(res.status).toBe(201);
    expect(res.body.chain.map((s: any) => s.role)).toEqual(['librarian', 'hod']);
    expect(res.body.timeline.map((s: any) => [s.role, s.assignee.id, s.decision])).toEqual([
      ['librarian', 'u_iyer', 'pending'],
      ['hod', 'u_kulkarni', 'waiting'],
    ]);
    const id = res.body.id;

    // Returned by the HoD → resubmit → both sign again (any change goes back to everyone)
    await ctx.login('u_iyer');
    await ctx.act('u_iyer', id, 'approved');
    await ctx.act('u_kulkarni', id, 'returned');
    const again = await ctx.as('u_riya').post(`/api/requests/${id}/resubmit`, { form: { ...form, purpose: 'Medical certificate attached' } });
    expect(again.status).toBe(200);
    expect(again.body.timeline.filter((s: any) => s.decision === 'pending').map((s: any) => s.role)).toEqual(['librarian']);

    await ctx.act('u_iyer', id, 'approved');
    await ctx.act('u_kulkarni', id, 'approved');
    expect((await ctx.as('u_riya').get(`/api/requests/${id}`)).body.status).toBe('sealed');
  });
});
