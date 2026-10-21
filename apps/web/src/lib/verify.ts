import { passFromText, verifyPass, type PassPayload, type VerifyResult } from '@plc/shared';

const KEY = 'plc.issuerKey';

/** Issuer public key: fetched when online, cached for offline checks. */
export async function issuerKey(): Promise<string | null> {
  try {
    const r = await fetch('/api/issuer-public-key');
    if (r.ok) {
      const { publicKey } = await r.json();
      try {
        localStorage.setItem(KEY, publicKey);
      } catch {
        /* ignore */
      }
      return publicKey;
    }
  } catch {
    /* offline */
  }
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export type Check =
  | { kind: 'file' | 'hash'; name: string; hash: string; live: VerifyResult | null }
  | { kind: 'pass'; signatureOk: boolean; payload: PassPayload | null; live: VerifyResult | null };

async function live(url: string): Promise<VerifyResult | null> {
  try {
    const r = await fetch(url);
    if (r.status === 429) throw new Error('Too many checks, try again in a minute');
    return r.ok ? ((await r.json()) as VerifyResult) : null;
  } catch (e) {
    if ((e as Error).message.startsWith('Too many')) throw e;
    return null; // offline
  }
}

export async function checkFile(file: File): Promise<Check> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { kind: 'file', name: file.name, hash, live: await live(`/api/verify/hash/${hash}`) };
}

export async function checkHash(hash: string): Promise<VerifyResult | null> {
  return live(`/api/verify/hash/${hash}`);
}

/** QR text (URL or token) → signature checked locally, then live status by (request, version). */
export async function checkQr(text: string): Promise<Check | null> {
  const token = passFromText(text);
  if (!token) return null;
  const key = await issuerKey();
  const { ok, payload } = key ? await verifyPass(token, key) : { ok: false, payload: null };
  const status = ok && payload ? await live(`/api/verify/ref/${encodeURIComponent(payload.rid)}/${payload.v}`) : null;
  return { kind: 'pass', signatureOk: ok, payload, live: status };
}
