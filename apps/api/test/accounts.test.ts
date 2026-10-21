import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { setup, RIYA_EVENT } from './helpers.js';

const PDF = Buffer.from('%PDF-1.4\n% letter\n%%EOF\n');

async function signUp(ctx: any, body: object) {
  return request(ctx.app).post('/api/auth/signup').send(body);
}
const student = (email: string, extra: object = {}) => ({ kind: 'student', name: 'Aarav Shah', email, password: 'secret12', pin: '4321', departmentId: 'cse', ...extra });
const staff = (email: string, designation: string, extra: object = {}) => ({ kind: 'staff', name: 'Dr. Meera Nair', email, password: 'secret12', pin: '9876', departmentId: 'cse', designation, ...extra });
const authed = (ctx: any, token: string) => ({
  get: (u: string) => request(ctx.app).get(u).set('Authorization', `Bearer ${token}`),
  post: (u: string, b: object = {}) => request(ctx.app).post(u).set('Authorization', `Bearer ${token}`).send(b),
  put: (u: string, b: object = {}) => request(ctx.app).put(u).set('Authorization', `Bearer ${token}`).send(b),
  del: (u: string) => request(ctx.app).delete(u).set('Authorization', `Bearer ${token}`),
  upload: (body: Buffer, name = 'letter.pdf') => request(ctx.app).post('/api/attachments').set('Authorization', `Bearer ${token}`).set('Content-Type', 'application/pdf').set('X-Filename', name).send(body),
});
async function decideAs(ctx: any, token: string, requestId: string, pin: string, decision = 'approved') {
  const u = authed(ctx, token);
  const item = (await u.get('/api/inbox')).body.find((i: any) => i.id === requestId);
  return u.post(`/api/approvals/${item.approvalId}/decide`, { decision, pin, comment: decision === 'approved' ? undefined : 'Fix it' });
}

describe('sign up and log in', () => {
  it('a student signs up, logs in with email and password, and edits their profile', async () => {
    const ctx = await setup();
    const res = await signUp(ctx, student('Aarav@Example.com', { rollNo: 'CS21-044', year: '3rd year' }));
    expect(res.status).toBe(201);
    expect(res.body.roles).toEqual(['student']);
    const login = await request(ctx.app).post('/api/auth/login').send({ email: 'aarav@example.com', password: 'secret12' });
    expect(login.status).toBe(200);
    const me = (await authed(ctx, login.body.token).get('/api/me')).body;
    expect(me).toMatchObject({ name: 'Aarav Shah', kind: 'student', email: 'aarav@example.com', rollNo: 'CS21-044', year: '3rd year', department: 'Computer Science and Engineering', roles: ['student'] });
    expect(me.title).toBe('3rd year, Computer Science and Engineering');
    const edited = (await authed(ctx, login.body.token).put('/api/me', { phone: '98200 00000', bio: 'Robotics club' })).body;
    expect(edited).toMatchObject({ phone: '98200 00000', bio: 'Robotics club', name: 'Aarav Shah' });
    expect((await authed(ctx, login.body.token).put('/api/me', { name: ' ' })).status).toBe(400);
  });

  it('staff sign up with a designation, which decides their role and home', async () => {
    const ctx = await setup();
    const res = await signUp(ctx, staff('meera@college.edu', 'hod', { title: 'Professor & HoD', employeeId: 'E-1021' }));
    expect(res.body.roles).toEqual(['hod']);
    const me = (await authed(ctx, res.body.token).get('/api/me')).body;
    expect(me).toMatchObject({ kind: 'staff', title: 'Professor & HoD', employeeId: 'E-1021' });
    const reg = await signUp(ctx, staff('registrar@college.edu', 'admin', { name: 'Mr. Kale' }));
    expect(reg.body.roles).toEqual(['admin']);
  });

  it('validates input and refuses duplicates and wrong passwords', async () => {
    const ctx = await setup();
    expect((await signUp(ctx, { ...student('a@b.co'), kind: 'robot' })).status).toBe(400);
    expect((await signUp(ctx, student('not-an-email'))).body.error).toMatch(/valid email/);
    expect((await signUp(ctx, student('a@b.co', { password: '123' }))).body.error).toMatch(/at least 6/);
    expect((await signUp(ctx, student('a@b.co', { pin: '12' }))).body.error).toMatch(/4 digits/);
    expect((await signUp(ctx, student('a@b.co', { departmentId: 'nope' }))).body.error).toMatch(/department/);
    expect((await signUp(ctx, staff('s@b.co', 'student'))).body.error).toMatch(/designation/);
    expect((await signUp(ctx, student('a@b.co'))).status).toBe(201);
    expect((await signUp(ctx, student('A@B.CO'))).status).toBe(409);
    expect((await signUp(ctx, student('riya@campus.example'))).status).toBe(409); // demo account email
    expect((await request(ctx.app).post('/api/auth/login').send({ email: 'a@b.co', password: 'wrong!!' })).status).toBe(401);
    expect((await request(ctx.app).post('/api/auth/login').send({ email: 'riya@campus.example', password: 'demo1234' })).status).toBe(200);
  });

  it('demo-profile PIN log in can be switched off (production)', async () => {
    const ctx = await setup();
    const { createApp } = await import('../src/app.js');
    const prod = createApp(ctx.db, { ...ctx.svc, allowPinLogin: false });
    expect((await request(prod).post('/api/auth/login').send({ userId: 'u_riya', pin: '1234' })).status).toBe(401);
    expect((await request(prod).post('/api/auth/login').send({ email: 'riya@campus.example', password: 'demo1234' })).status).toBe(200);
  });
});

describe('live routing with new accounts', () => {
  it('a newly signed-up HoD receives the next request in their department', async () => {
    const ctx = await setup();
    const hod = (await signUp(ctx, staff('newhod@college.edu', 'hod'))).body.token;
    const id = (await ctx.as('u_riya').post('/api/requests', { type: 'bonafide', form: { title: 'Visa' } })).body.id;
    const inbox = (await authed(ctx, hod).get('/api/inbox')).body;
    expect(inbox.map((i: any) => i.id)).toEqual([id]);
    expect((await ctx.as('u_kulkarni').get('/api/inbox')).body).toHaveLength(0);
    expect((await decideAs(ctx, hod, id, '9876')).status).toBe(200);
  });

  it('a student connected with a specific HoD is routed to that HoD', async () => {
    const ctx = await setup();
    await signUp(ctx, staff('newhod@college.edu', 'hod')); // newest HoD...
    const conn = (await ctx.as('u_riya').post('/api/connections', { staffId: 'u_kulkarni' })).body[0];
    await ctx.as('u_kulkarni').post(`/api/connections/${conn.id}/accept`);
    const id = (await ctx.as('u_riya').post('/api/requests', { type: 'bonafide', form: { title: 'Visa' } })).body.id;
    expect((await ctx.as('u_kulkarni').get('/api/inbox')).body.map((i: any) => i.id)).toEqual([id]); // ...but Riya's own HoD wins
  });
});

describe('teachers: search, connect, accept', () => {
  it('student searches staff, sends a request; staff accept or decline; blocks list accepted teachers', async () => {
    const ctx = await setup();
    const s = (await signUp(ctx, student('aarav@example.com'))).body.token;
    const t = (await signUp(ctx, staff('meera@college.edu', 'faculty', { title: 'Associate Professor' }))).body.token;
    const me = authed(ctx, s);

    const found = (await me.get('/api/people?kind=staff&q=meera')).body;
    expect((await me.get('/api/people?kind=staff&q=associate')).body.map((p: any) => p.name).sort()).toEqual(['Dr. Meera Nair', 'Prof. Joshi']);
    expect(found.map((p: any) => p.name)).toEqual(['Dr. Meera Nair']);
    expect((await me.get('/api/people?kind=staff&q=hod')).body.map((p: any) => p.name)).toContain('Prof. Kulkarni');

    const sent = (await me.post('/api/connections', { staffId: found[0].id })).body;
    expect(sent).toMatchObject([{ status: 'pending', person: { name: 'Dr. Meera Nair', roleLabel: 'Faculty' } }]);
    expect((await me.post('/api/connections', { staffId: found[0].id })).status).toBe(409);
    expect((await me.post('/api/connections', { staffId: 'u_riya' })).status).toBe(400); // not staff

    const incoming = (await authed(ctx, t).get('/api/connections')).body;
    expect(incoming).toMatchObject([{ status: 'pending', person: { name: 'Aarav Shah', kind: 'student' } }]);
    expect((await ctx.as('u_kulkarni').post(`/api/connections/${incoming[0].id}/accept`)).status).toBe(404); // not theirs
    expect((await authed(ctx, t).post(`/api/connections/${incoming[0].id}/accept`)).body[0].status).toBe('accepted');
    expect((await me.get('/api/connections')).body[0].status).toBe('accepted');
    expect(ctx.db.prepare("SELECT COUNT(*) FROM outbox WHERE kind = 'connection'").pluck().get()).toBe(2);

    // decline + remove
    const c2 = (await me.post('/api/connections', { staffId: 'u_mehta' })).body.find((c: any) => c.person.id === 'u_mehta');
    await ctx.as('u_mehta').post(`/api/connections/${c2.id}/decline`);
    expect((await me.get('/api/connections')).body.map((c: any) => c.person.name)).toEqual(['Dr. Meera Nair']);
    expect((await authed(ctx, t).post('/api/connections', { staffId: 'u_mehta' })).status).toBe(403); // staff cannot add staff
    expect((await me.del(`/api/connections/${incoming[0].id}`)).status).toBe(200);
    expect((await me.get('/api/connections')).body).toHaveLength(0);
  });
});

describe('document library and sending to anyone', () => {
  it('upload to the library, send to a teacher, they sign with their PIN, it is sealed and verifies', async () => {
    const ctx = await setup();
    const s = authed(ctx, (await signUp(ctx, student('aarav@example.com'))).body.token);
    const tToken = (await signUp(ctx, staff('meera@college.edu', 'faculty'))).body.token;
    const teacherId = (await authed(ctx, tToken).get('/api/me')).body.id;

    const doc = (await s.upload(PDF, 'LOR draft.pdf')).body;
    expect((await s.get('/api/documents')).body.map((d: any) => d.name)).toEqual(['LOR draft.pdf']);

    expect((await s.post('/api/requests', { type: 'document_signature', form: { title: 'Letter of recommendation' }, attachments: [doc.id] })).body.error).toBe('Pick who to send it to');
    expect((await s.post('/api/requests', { type: 'document_signature', form: { title: 'LOR' }, recipientId: teacherId })).body.error).toBe('Attach at least one document');
    const sent = await s.post('/api/requests', { type: 'document_signature', form: { title: 'Letter of recommendation', purpose: 'For my MS applications' }, attachments: [doc.id], recipientId: teacherId });
    expect(sent.status).toBe(201);
    expect(sent.body.timeline).toMatchObject([{ role: 'recipient', roleLabel: 'Recipient', assignee: { id: teacherId, name: 'Dr. Meera Nair' }, decision: 'pending' }]);

    expect((await decideAs(ctx, tToken, sent.body.id, '9876')).status).toBe(200);
    const d = (await s.get(`/api/requests/${sent.body.id}`)).body;
    expect(d.status).toBe('sealed');
    expect((await ctx.pub(`/api/verify/hash/${d.seal.docHash}`)).body).toMatchObject({ status: 'verified', typeName: 'Document for signature' });
    // the library still has the document and knows it was used
    expect((await s.get('/api/documents')).body[0]).toMatchObject({ id: doc.id, usedIn: 1 });
    expect((await s.del(`/api/documents/${doc.id}`)).status).toBe(200);
    expect((await s.get(`/api/requests/${sent.body.id}`)).body.attachments).toHaveLength(1); // the sent copy stays
  });

  it('a student can send a document to another student, who signs it from their own inbox', async () => {
    const ctx = await setup();
    const peer = (await signUp(ctx, student('peer@example.com', { name: 'Isha Rao' }))).body.token;
    const peerId = (await authed(ctx, peer).get('/api/me')).body.id;
    const doc = (await (await import('supertest')).default(ctx.app).post('/api/attachments')
      .set('Authorization', `Bearer ${(await request(ctx.app).post('/api/auth/login').send({ email: 'riya@campus.example', password: 'demo1234' })).body.token}`)
      .set('Content-Type', 'application/pdf').set('X-Filename', 'team.pdf').send(PDF)).body;
    const people = (await ctx.as('u_riya').get('/api/people?kind=student')).body;
    expect(people.map((p: any) => p.name)).toContain('Isha Rao');
    const id = (await ctx.as('u_riya').post('/api/requests', { type: 'document_signature', form: { title: 'Team declaration' }, attachments: [doc.id], recipientId: peerId })).body.id;
    expect((await authed(ctx, peer).get('/api/inbox')).body.map((i: any) => i.id)).toEqual([id]);
    await decideAs(ctx, peer, id, '4321');
    expect((await ctx.as('u_riya').get(`/api/requests/${id}`)).body.status).toBe('sealed');
  });

  it('the original event flow still works end to end alongside', async () => {
    const ctx = await setup();
    const id = await ctx.approvedEvent(RIYA_EVENT);
    expect((await ctx.as('u_riya').get(`/api/requests/${id}`)).body.status).toBe('sealed');
  });
});
