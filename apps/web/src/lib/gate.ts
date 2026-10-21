import { gateCheck, verifyJson, passFromText, type GateCheck, type SignedRevocationList, type VerifyResult } from '@plc/shared';
import { issuerKey } from './verify';

const LIST = 'plc.gate.list';

export function cachedList(): SignedRevocationList | null {
  try {
    return JSON.parse(localStorage.getItem(LIST) ?? 'null');
  } catch {
    return null;
  }
}

const withTimeout = (ms: number) => {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
};

/** Fetch the signed revocation list and keep it only if its signature checks out. */
export async function syncList(): Promise<SignedRevocationList> {
  const key = await issuerKey();
  if (!key) throw new Error('Connect once to download the issuer key');
  const res = await fetch('/api/revocations', { signal: withTimeout(8000) });
  if (!res.ok) throw new Error('Could not sync the list');
  const body = (await res.json()) as SignedRevocationList;
  if (!(await verifyJson(body.list, body.signature, key))) throw new Error('List signature is wrong; kept the previous list');
  try {
    localStorage.setItem(LIST, JSON.stringify(body));
  } catch {
    /* storage full or blocked: still use it for this session */
  }
  return body;
}

/** Full gate decision: offline first, live status if the network answers within 2.5 s. */
export async function checkAtGate(text: string): Promise<GateCheck> {
  const token = passFromText(text) ?? text;
  const publicKey = await issuerKey();
  if (!publicKey) return { result: 'invalid', payload: null, source: 'offline', stale: true, listIssuedAt: null };
  let live: VerifyResult | null = null;
  const { decodePass } = await import('@plc/shared');
  const d = decodePass(token);
  if (d && navigator.onLine) {
    try {
      const r = await fetch(`/api/verify/ref/${encodeURIComponent(d.payload.rid)}/${d.payload.v}`, { signal: withTimeout(2500) });
      if (r.ok) live = await r.json();
    } catch {
      /* offline or slow: decide from the cached list */
    }
  }
  return gateCheck(token, { publicKey, list: cachedList(), now: Math.floor(Date.now() / 1000), live });
}
