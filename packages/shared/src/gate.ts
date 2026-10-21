import { verifyJson } from './crypto';
import { verifyPass, type PassPayload } from './pass';
import { verdictFor, type RevocationList } from './status';
import type { VerifyResult } from './index';

export type GateResult = 'valid' | 'not_today' | 'superseded' | 'revoked' | 'invalid';

export interface SignedRevocationList {
  list: RevocationList;
  signature: string;
}

export interface GateCheck {
  result: GateResult;
  payload: PassPayload | null;
  /** online = live server status decided; offline = signature + device clock + cached list */
  source: 'online' | 'offline';
  /** The cached list is missing, badly signed, older than the threshold, or not from today (IST). */
  stale: boolean;
  listIssuedAt: string | null;
}

const IST_DAY = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/**
 * The gate decision, fully offline unless `live` is given:
 * 1. Ed25519 signature on the pass, checked with the cached issuer public key.
 * 2. The validity window (event date only) against the device clock.
 * 3. The cached, issuer-signed revocation list (revoked and superseded passes).
 * 4. If a live status is available it wins over the cached list.
 * Precedence comes from verdictFor: Revoked > Superseded > outside window > valid.
 */
export async function gateCheck(
  token: string,
  ctx: { publicKey: string; list: SignedRevocationList | null; now: number; live?: VerifyResult | null; staleAfterSec?: number },
): Promise<GateCheck> {
  const { ok, payload } = await verifyPass(token, ctx.publicKey);
  const listOk = !!ctx.list && (await verifyJson(ctx.list.list, ctx.list.signature, ctx.publicKey));
  const issued = listOk ? Date.parse(ctx.list!.list.issuedAt) : NaN;
  const stale =
    !listOk || ctx.now - issued / 1000 > (ctx.staleAfterSec ?? 12 * 3600) || IST_DAY(issued) !== IST_DAY(ctx.now * 1000);
  const base = { payload, stale, listIssuedAt: listOk ? ctx.list!.list.issuedAt : null };
  if (!ok || !payload) return { ...base, result: 'invalid', source: 'offline' };

  const live = ctx.live && ctx.live.status !== 'pending' ? ctx.live : null;
  if (live?.status === 'not_found') return { ...base, result: 'invalid', source: 'online' };
  const entry = listOk ? ctx.list!.list.entries.find((e) => e.rid === payload.rid && e.v === payload.v) : undefined;
  const revoked = live ? live.status === 'revoked' : entry?.status === 'revoked';
  const superseded = live ? live.status === 'superseded' : entry?.status === 'superseded';

  const v = verdictFor({ revoked, superseded, validFrom: payload.vf, validUntil: payload.vu, now: ctx.now });
  const result: GateResult = v === 'verified' ? 'valid' : v === 'not_yet_valid' || v === 'expired' ? 'not_today' : v;
  return { ...base, result, source: live ? 'online' : 'offline' };
}
