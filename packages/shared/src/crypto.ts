import * as ed from '@noble/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

export { bytesToHex, hexToBytes };

/** JSON with keys sorted at every level, so the same data always hashes and signs the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(',')}}`;
}

export const sha256Hex = (data: Uint8Array | string) =>
  bytesToHex(sha256(typeof data === 'string' ? utf8ToBytes(data) : data));

export const newPrivateKeyHex = () => bytesToHex(ed.utils.randomPrivateKey());
export const publicKeyHex = async (privateKeyHex: string) => bytesToHex(await ed.getPublicKeyAsync(privateKeyHex));

export const signJson = async (data: unknown, privateKeyHex: string) =>
  bytesToHex(await ed.signAsync(utf8ToBytes(canonicalJson(data)), privateKeyHex));

export async function verifyJson(data: unknown, signatureHex: string, publicKey: string): Promise<boolean> {
  try {
    return await ed.verifyAsync(signatureHex, utf8ToBytes(canonicalJson(data)), publicKey);
  } catch {
    return false;
  }
}
