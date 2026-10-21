/**
 * One verdict for a sealed document, used by the API, the verify page and the gate.
 * Precedence: Revoked > Superseded > outside the validity window > Verified.
 */
export type Verdict = 'revoked' | 'superseded' | 'not_yet_valid' | 'expired' | 'verified';

export interface VerdictInput {
  revoked: boolean;
  superseded: boolean;
  validFrom: number; // unix seconds
  validUntil: number; // unix seconds
  now: number; // unix seconds
}

export function verdictFor(i: VerdictInput): Verdict {
  if (i.revoked) return 'revoked';
  if (i.superseded) return 'superseded';
  if (i.now < i.validFrom) return 'not_yet_valid';
  if (i.now > i.validUntil) return 'expired';
  return 'verified';
}

/** Signed list of passes that must not be accepted, for offline checks. */
export interface RevocationEntry {
  rid: string;
  v: number;
  hash: string;
  status: 'revoked' | 'superseded';
  at: string;
}
export interface RevocationList {
  issuedAt: string;
  entries: RevocationEntry[];
}
