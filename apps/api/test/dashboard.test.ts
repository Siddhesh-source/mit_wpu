import { describe, it, expect } from 'vitest';
import { setup, RIYA_EVENT } from './helpers.js';

describe('staff dashboard', () => {
  it('counts waiting work and lists my signed decisions, newest first', async () => {
    const ctx = await setup();
    const empty = (await ctx.as('u_mehta').get('/api/dashboard')).body;
    expect(empty).toMatchObject({ waiting: 0, overdue: 0, decided: { total: 0 }, avgResponseHours: null, delegation: null, history: [] });

    const sealed = await ctx.approvedEvent();
    const returned = (await ctx.as('u_riya').post('/api/requests', { type: 'event_permission', form: { ...RIYA_EVENT, title: 'Hackathon' } })).body.id;
    await ctx.act('u_mehta', returned, 'returned');
    const waiting = (await ctx.as('u_riya').post('/api/requests', { type: 'on_duty', form: { title: 'Conference', date: '2026-11-20', purpose: 'Paper' } })).body.id;

    const d = (await ctx.as('u_mehta').get('/api/dashboard')).body;
    expect(waiting).toMatch(/^PLC-/);
    expect(d.waiting).toBe(1);
    expect(d.decided).toEqual({ total: 2, approved: 1, returned: 1, rejected: 0, thisWeek: 2 });
    expect(typeof d.avgResponseHours).toBe('number');
    expect(d.history.map((h: any) => [h.requestId, h.decision, h.status])).toEqual([
      [returned, 'returned', 'returned'],
      [sealed, 'approved', 'sealed'],
    ]);
    expect(d.history[0]).toMatchObject({ title: 'Hackathon', typeName: 'Event permission', student: { id: 'u_riya' }, role: 'faculty_coordinator', comment: 'Please fix' });

    // Only my own decisions: the HoD sees just the one they signed
    expect((await ctx.as('u_kulkarni').get('/api/dashboard')).body.history.map((h: any) => h.requestId)).toEqual([sealed]);
  });

  it('is for staff only', async () => {
    const ctx = await setup();
    expect((await ctx.as('u_riya').get('/api/dashboard')).status).toBe(403);
    expect((await ctx.as('u_admin').get('/api/dashboard')).status).toBe(200);
  });
});
