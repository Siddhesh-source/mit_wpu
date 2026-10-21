import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Contract, JsonRpcProvider, Wallet, encodeBytes32String, ZeroHash, id as keccak } from 'ethers';
import { DocumentRegistryArtifact, LOCAL_DEV_KEY, deployRegistry, startLocalNode } from '../lib/index.js';

let node: { url: string; stop: () => Promise<void> };
let provider: JsonRpcProvider;
let reg: Contract;
let stranger: Contract;

const OTHER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'; // hardhat account #1

beforeAll(async () => {
  node = await startLocalNode(8611);
  provider = new JsonRpcProvider(node.url, undefined, { staticNetwork: true, cacheTimeout: -1 });
}, 40_000);
afterAll(() => node?.stop());

beforeEach(async () => {
  const owner = new Wallet(LOCAL_DEV_KEY, provider);
  const address = await deployRegistry(owner);
  reg = new Contract(address, DocumentRegistryArtifact.abi as never, owner);
  stranger = new Contract(address, DocumentRegistryArtifact.abi as never, new Wallet(OTHER_KEY, provider));
});

const RID = encodeBytes32String('PLC-2026-0001');
const h = (s: string) => keccak(s); // any 32-byte value works as a test document hash
const rec = (over: Partial<Record<string, unknown>> = {}) => ({
  issuer: encodeBytes32String('COLLEGE-001'),
  requestId: RID,
  docType: encodeBytes32String('event_permission'),
  version: 1,
  prevHash: ZeroHash,
  rolesHash: h('roles'),
  sealedAt: 0,
  validFrom: 1793817000,
  validUntil: 1793903399,
  status: 0,
  ...over,
});
const send = async (p: Promise<any>) => (await p).wait();

/** Expect a call to revert with a named custom error from the contract ABI. */
async function reverts(p: Promise<unknown>, name: string) {
  try {
    await p;
  } catch (e: any) {
    const data = e?.data ?? e?.info?.error?.data?.data ?? e?.info?.error?.data;
    expect(reg.interface.parseError(data)?.name).toBe(name);
    return;
  }
  throw new Error(`expected revert ${name}`);
}

describe('DocumentRegistry', () => {
  it('seals v1 as Active with its metadata and no personal data fields', async () => {
    await send(reg.seal(h('v1'), rec()));
    const r = await reg.get(h('v1'));
    expect(r.status).toBe(1n);
    expect(r.version).toBe(1n);
    expect(r.requestId).toBe(RID);
    expect(r.validFrom).toBe(1793817000n);
    expect(r.sealedAt).toBeGreaterThan(0n);
    expect(await reg.latestFor(RID)).toBe(h('v1'));
    expect(r.issuer).toBe(encodeBytes32String('COLLEGE-001'));
    expect(Object.keys(r.toObject())).toEqual(['issuer', 'requestId', 'docType', 'version', 'prevHash', 'rolesHash', 'sealedAt', 'validFrom', 'validUntil', 'status']);
  });

  it('rejects a duplicate hash, a second v1 for the same request, a zero hash and a bad first version', async () => {
    await send(reg.seal(h('v1'), rec()));
    await reverts(reg.seal(h('v1'), rec()), 'AlreadySealed');
    await reverts(reg.seal(h('other'), rec()), 'RequestAlreadySealed');
    await reverts(reg.seal(ZeroHash, rec({ requestId: encodeBytes32String('X') })), 'EmptyHash');
    await reverts(reg.seal(h('x'), rec({ requestId: encodeBytes32String('X'), version: 2 })), 'BadVersion');
  });

  it('v2 with prevHash supersedes v1 and links both ways', async () => {
    await send(reg.seal(h('v1'), rec()));
    await send(reg.seal(h('v2'), rec({ version: 2, prevHash: h('v1') })));
    expect((await reg.get(h('v1'))).status).toBe(2n);
    expect((await reg.get(h('v2'))).status).toBe(1n);
    expect((await reg.get(h('v2'))).prevHash).toBe(h('v1'));
    expect(await reg.supersededBy(h('v1'))).toBe(h('v2'));
    expect(await reg.latestFor(RID)).toBe(h('v2'));
  });

  it('refuses to amend from a version that is not Active, from another request, or skipping a version', async () => {
    await send(reg.seal(h('v1'), rec()));
    await send(reg.seal(h('v2'), rec({ version: 2, prevHash: h('v1') })));
    await reverts(reg.seal(h('v2b'), rec({ version: 2, prevHash: h('v1') })), 'PrevNotActive');
    await reverts(reg.seal(h('v3'), rec({ version: 4, prevHash: h('v2') })), 'BadVersion');
    await reverts(reg.seal(h('y'), rec({ requestId: encodeBytes32String('PLC-2026-0002'), version: 3, prevHash: h('v2') })), 'PrevOtherRequest');
    await reverts(reg.seal(h('z'), rec({ version: 2, prevHash: h('never') })), 'PrevNotActive');
  });

  it('revokes an Active document once, with a reason code', async () => {
    await send(reg.seal(h('v1'), rec()));
    await send(reg.revoke(h('v1'), 2));
    expect((await reg.get(h('v1'))).status).toBe(3n);
    expect(await reg.revokeReason(h('v1'))).toBe(2n);
    await reverts(reg.revoke(h('v1'), 1), 'NotActive');
    await reverts(reg.revoke(h('unknown'), 1), 'NotActive');
  });

  it('a revoked version cannot be amended', async () => {
    await send(reg.seal(h('v1'), rec()));
    await send(reg.revoke(h('v1'), 1));
    await reverts(reg.seal(h('v2'), rec({ version: 2, prevHash: h('v1') })), 'PrevNotActive');
  });

  it('only the owner can write', async () => {
    await reverts(stranger.seal(h('v1'), rec()), 'NotOwner');
    await send(reg.seal(h('v1'), rec()));
    await reverts(stranger.revoke(h('v1'), 1), 'NotOwner');
  });

  it('an unknown hash reads as status None', async () => {
    expect((await reg.get(h('nothing'))).status).toBe(0n);
  });
});
