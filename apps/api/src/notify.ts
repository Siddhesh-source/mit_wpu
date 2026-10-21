import type { DB } from './db.js';

/**
 * Email notifications. Events write to the `outbox` table inside the same transaction as the change, so a
 * notification is never lost or sent for a change that rolled back. `processOutbox` delivers them with the
 * configured mailer: `log` (default; prints and marks them "logged", visible in Admin → Emails) or `ses` (AWS SES).
 */
export interface Mail {
  to: string;
  subject: string;
  text: string;
}
export interface Mailer {
  name: 'log' | 'ses';
  send(mail: Mail): Promise<void>;
}

export interface NotifyConfig {
  provider: 'log' | 'ses' | 'off';
  from: string;
  sesRegion: string;
  /** Send every email to this one address instead (SES sandbox / demos). */
  redirectAll: string;
  publicBaseUrl: string;
}

let cfg: Pick<NotifyConfig, 'publicBaseUrl'> = { publicBaseUrl: 'http://localhost:5173' };
export const configureLinks = (c: Pick<NotifyConfig, 'publicBaseUrl'>) => (cfg = c);
export const link = (path: string) => `${cfg.publicBaseUrl.replace(/\/$/, '')}${path}`;

export type Kind =
  | 'approval_needed'
  | 'returned'
  | 'rejected'
  | 'sealed'
  | 'amendment_needed'
  | 'amendment_returned'
  | 'revoked'
  | 'gate_revoked'
  | 'sla_nudge'
  | 'sla_escalated'
  | 'delegated'
  | 'reopened'
  | 'comment'
  | 'connection';

/** Queue an email to each user (skips users without an address). */
export function notify(db: DB, userIds: string | string[], kind: Kind, subject: string, text: string, requestId: string | null = null) {
  const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])];
  const ins = db.prepare('INSERT INTO outbox (to_user, to_addr, subject, body_text, kind, request_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const t = new Date().toISOString();
  for (const id of ids) {
    const u = db.prepare('SELECT name, email FROM users WHERE id = ?').get(id) as { name: string; email: string | null } | undefined;
    if (!u?.email) continue;
    ins.run(id, u.email, subject, `Hello ${u.name},\n\n${text}\n\nPaperLess Campus`, kind, requestId, t);
  }
}

export function mailerFromConfig(c: NotifyConfig): Mailer | null {
  if (c.provider === 'off') return null;
  const to = (addr: string) => c.redirectAll || addr;
  if (c.provider === 'ses') {
    let client: import('@aws-sdk/client-sesv2').SESv2Client | null = null;
    return {
      name: 'ses',
      async send(m) {
        const { SESv2Client, SendEmailCommand } = await import('@aws-sdk/client-sesv2');
        client ??= new SESv2Client({ region: c.sesRegion }); // credentials: instance role / env / profile
        await client.send(
          new SendEmailCommand({
            FromEmailAddress: c.from,
            Destination: { ToAddresses: [to(m.to)] },
            Content: { Simple: { Subject: { Data: m.subject, Charset: 'UTF-8' }, Body: { Text: { Data: m.text, Charset: 'UTF-8' } } } },
          }),
        );
      },
    };
  }
  return {
    name: 'log',
    async send(m) {
      if (process.env.NODE_ENV !== 'test') console.log(`[email] to ${to(m.to)}: ${m.subject}`);
    },
  };
}

/** Deliver queued emails. Failures are retried up to 5 times, then marked failed. Never throws. */
export async function processOutbox(db: DB, mailer: Mailer | null, limit = 20) {
  if (!mailer) return;
  const rows = db
    .prepare("SELECT id, to_addr, subject, body_text FROM outbox WHERE status = 'pending' ORDER BY id LIMIT ?")
    .all(limit) as { id: number; to_addr: string; subject: string; body_text: string }[];
  for (const r of rows) {
    try {
      await mailer.send({ to: r.to_addr, subject: r.subject, text: r.body_text });
      db.prepare('UPDATE outbox SET status = ?, sent_at = ?, last_error = NULL WHERE id = ?').run(mailer.name === 'log' ? 'logged' : 'sent', new Date().toISOString(), r.id);
    } catch (e) {
      db.prepare("UPDATE outbox SET attempts = attempts + 1, last_error = ?, status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END WHERE id = ?").run(
        ((e as Error).message ?? String(e)).slice(0, 300),
        r.id,
      );
    }
  }
}
