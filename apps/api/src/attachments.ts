import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { sha256Hex, type AttachmentInfo, type Role } from '@plc/shared';
import type { DB } from './db.js';
import { HttpError } from './errors.js';
import { canView } from './workflow.js';

export const ALLOWED: Record<string, string> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' };

/** Store an uploaded file (raw body) for a student. It stays unlinked until a submit / resubmit / amend claims it. */
export function saveUpload(db: DB, storageDir: string, ownerId: string, mime: string, rawName: string, body: Buffer): AttachmentInfo {
  const type = mime.split(';')[0].trim().toLowerCase();
  const ext = ALLOWED[type];
  if (!ext) throw new HttpError(415, 'Only PDF, PNG or JPG files');
  if (!body?.length) throw new HttpError(400, 'Empty file');
  const magic = body.subarray(0, 4).toString('latin1');
  const looksRight = ext === 'pdf' ? magic.startsWith('%PDF') : ext === 'png' ? magic === '\x89PNG' : body[0] === 0xff && body[1] === 0xd8;
  if (!looksRight) throw new HttpError(415, 'The file does not match its type');
  const name = (decodeURIComponent(rawName || `file.${ext}`).replace(/[^\w.\- ()]/g, '_').trim() || `file.${ext}`).slice(0, 120);
  const id = randomUUID();
  const dir = path.join(storageDir, 'attachments');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.${ext}`);
  fs.writeFileSync(file, body);
  const sha256 = sha256Hex(body);
  db.prepare('INSERT INTO attachments (id, owner_id, name, mime, size, sha256, path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    id, ownerId, name, type, body.length, sha256, file, new Date().toISOString(),
  );
  return { id, name, mime: type, size: body.length, sha256, version: 0 };
}

/** File for download: the uploader, or anyone who can see the request it is attached to. */
export function attachmentFor(db: DB, userId: string, roles: Role[], id: string) {
  const a = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as
    | { owner_id: string; request_id: string | null; name: string; mime: string; path: string }
    | undefined;
  if (!a) throw new HttpError(404, 'Not found');
  const allowed = a.owner_id === userId || (a.request_id && canView(db, userId, roles, a.request_id));
  if (!allowed) throw new HttpError(403, 'Not your file');
  return a;
}
