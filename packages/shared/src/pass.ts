import * as ed from '@noble/ed25519';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

/**
 * The signed pass inside the QR code. Short keys keep the QR small.
 * Token = base64url(JSON body) + "." + base64url(Ed25519 signature over the exact body bytes).
 */
export interface PassPayload {
  rid: string; // request id
  v: number; // version
  t: string; // request type code
  ti: string; // title (event name / purpose)
  n: string; // student name
  d: string; // department
  dt?: string; // event date YYYY-MM-DD
  ve?: string; // venue
  vf: number; // valid from, unix seconds
  vu: number; // valid until, unix seconds
  iat: number; // issued at, unix seconds
}

const toB64url = (bytes: Uint8Array) => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export async function encodePass(payload: PassPayload, privateKeyHex: string): Promise<string> {
  const body = utf8ToBytes(JSON.stringify(payload));
  const sig = await ed.signAsync(body, privateKeyHex);
  return `${toB64url(body)}.${toB64url(sig)}`;
}

/** Parse without checking the signature. Returns null for anything malformed. */
export function decodePass(token: string): { payload: PassPayload; body: Uint8Array; sigHex: string } | null {
  try {
    const [b, s] = token.trim().split('.');
    if (!b || !s) return null;
    const body = fromB64url(b);
    const payload = JSON.parse(new TextDecoder().decode(body)) as PassPayload;
    if (typeof payload.rid !== 'string' || typeof payload.v !== 'number' || typeof payload.vf !== 'number' || typeof payload.vu !== 'number') return null;
    return { payload, body, sigHex: bytesToHex(fromB64url(s)) };
  } catch {
    return null;
  }
}

/** Decode and check the issuer signature locally (works offline). */
export async function verifyPass(token: string, publicKeyHex: string): Promise<{ ok: boolean; payload: PassPayload | null }> {
  const d = decodePass(token);
  if (!d) return { ok: false, payload: null };
  try {
    return { ok: await ed.verifyAsync(hexToBytes(d.sigHex), d.body, publicKeyHex), payload: d.payload };
  } catch {
    return { ok: false, payload: d.payload };
  }
}

export const passUrl = (baseUrl: string, token: string) => `${baseUrl.replace(/\/$/, '')}/verify#p=${token}`;

/** Pull a pass token out of a scanned QR (full URL or bare token). */
export function passFromText(text: string): string | null {
  const m = text.match(/[#?&]p=([A-Za-z0-9_\-.]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$/.test(text.trim()) ? text.trim() : null;
}

/** Event permission: the event date in IST (00:00:00 to 23:59:59). Everything else: one year from issue. */
export function validityFor(type: string, form: Record<string, unknown>, issuedAt: number): { vf: number; vu: number } {
  if (type === 'event_permission' && typeof form.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
    const vf = Math.floor(Date.parse(`${form.date}T00:00:00+05:30`) / 1000);
    return { vf, vu: vf + 86399 };
  }
  return { vf: issuedAt, vu: issuedAt + 365 * 86400 };
}
