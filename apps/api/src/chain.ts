import { Contract, JsonRpcProvider, Wallet, encodeBytes32String, decodeBytes32String, ZeroHash } from 'ethers';
import { DocumentRegistryArtifact, LOCAL_DEV_KEY, deployRegistry } from '@plc/contracts';

export interface ChainRecord {
  status: 'none' | 'active' | 'superseded' | 'revoked';
  issuer: string;
  requestId: string;
  docType: string;
  version: number;
  prevHash: string | null;
  sealedAt: number;
  validFrom: number;
  validUntil: number;
  supersededBy: string | null;
  revokeReason: number;
}

export interface SealArgs {
  docHash: string; // hex, no 0x
  issuer: string; // college id
  requestId: string;
  docType: string;
  version: number;
  prevHash: string | null;
  rolesHash: string;
  validFrom: number;
  validUntil: number;
}

export interface ChainOptions {
  network: 'local' | 'amoy' | string;
  rpcUrl: string;
  privateKey: string;
  /** Where to remember the contract address (the app's database). Without it, every connect deploys a fresh contract. */
  store?: { get: () => string | undefined; set: (address: string) => void };
  /** Called after a fresh deploy (e.g. local node restarted) so stored seals can be replayed. */
  onFreshDeploy?: () => void;
}

const STATUS = ['none', 'active', 'superseded', 'revoked'] as const;
const hx = (h: string) => (h.startsWith('0x') ? h : `0x${h}`).toLowerCase();
const plain = (h: string) => h.replace(/^0x/, '').toLowerCase();
const TIMEOUT = 20_000;

function withTimeout<T>(p: Promise<T>, what: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what} timed out`)), TIMEOUT))]);
}

/** Thin client for DocumentRegistry. Writes are serialised so nonces never collide. */
export class ChainClient {
  private contract: Contract | null = null;
  private connecting: Promise<Contract> | null = null;
  private lane: Promise<unknown> = Promise.resolve();

  constructor(private opts: ChainOptions) {}

  get network() {
    return this.opts.network;
  }

  async address() {
    return (await this.connect()).getAddress();
  }

  /** Forget the connected contract (after the stored address was cleared); the next call connects again. */
  reset() {
    this.contract = null;
    this.connecting = null;
  }

  /** Point at a different RPC (used by tests to simulate an outage and recovery). */
  useRpc(rpcUrl: string) {
    this.opts = { ...this.opts, rpcUrl };
    this.contract = null;
    this.connecting = null;
  }

  txUrl(txHash: string | null) {
    if (!txHash) return null;
    return this.opts.network === 'amoy' ? `https://amoy.polygonscan.com/tx/${txHash}` : null;
  }

  private connect(): Promise<Contract> {
    if (this.contract) return Promise.resolve(this.contract);
    this.connecting ??= (async () => {
      const provider = new JsonRpcProvider(this.opts.rpcUrl, undefined, { staticNetwork: true, cacheTimeout: -1 });
      const wallet = new Wallet(this.opts.privateKey, provider);
      let address = this.opts.store?.get();
      const hasCode = address ? (await withTimeout(provider.getCode(address), 'getCode')) !== '0x' : false;
      if (!hasCode) {
        const replace = !!address; // had a contract, chain lost it
        address = await withTimeout(deployRegistry(wallet), 'deploy');
        this.opts.store?.set(address);
        if (replace) this.opts.onFreshDeploy?.();
      }
      this.contract = new Contract(address!, DocumentRegistryArtifact.abi as never, wallet);
      return this.contract;
    })().catch((e) => {
      this.connecting = null;
      throw e;
    });
    return this.connecting;
  }

  /**
   * Connected contract that still has code. If the chain lost it (local node restarted), forget it and
   * connect again, which redeploys and triggers onFreshDeploy. Prevents "successful" writes to an empty address.
   */
  private async live(): Promise<Contract> {
    const c = await this.connect();
    if ((await withTimeout(c.runner!.provider!.getCode(await c.getAddress()), 'getCode')) !== '0x') return c;
    this.contract = null;
    this.connecting = null;
    return this.connect();
  }

  private write(fn: (c: Contract) => Promise<{ wait: () => Promise<{ hash: string } | null> }>): Promise<string> {
    const run = this.lane.then(async () => {
      const c = await this.live();
      try {
        const tx = await withTimeout(fn(c), 'send');
        const receipt = await withTimeout(tx.wait(), 'confirm');
        return receipt!.hash;
      } catch (e) {
        throw named(c, e);
      }
    });
    this.lane = run.catch(() => undefined);
    return run;
  }

  seal(a: SealArgs): Promise<string> {
    return this.write((c) =>
      c.seal(hx(a.docHash), {
        issuer: encodeBytes32String(a.issuer.slice(0, 31)),
        requestId: encodeBytes32String(a.requestId),
        docType: encodeBytes32String(a.docType.slice(0, 31)),
        version: a.version,
        prevHash: a.prevHash ? hx(a.prevHash) : ZeroHash,
        rolesHash: hx(a.rolesHash),
        sealedAt: 0,
        validFrom: a.validFrom,
        validUntil: a.validUntil,
        status: 0,
      }),
    );
  }

  revoke(docHash: string, reasonCode: number): Promise<string> {
    return this.write((c) => c.revoke(hx(docHash), reasonCode));
  }

  async get(docHash: string): Promise<ChainRecord> {
    const c = await this.live();
    const [r, next, reason] = await withTimeout(
      Promise.all([c.get(hx(docHash)), c.supersededBy(hx(docHash)), c.revokeReason(hx(docHash))]),
      'read',
    );
    const status = STATUS[Number(r.status)];
    return {
      status,
      issuer: status === 'none' ? '' : decodeBytes32String(r.issuer),
      requestId: status === 'none' ? '' : decodeBytes32String(r.requestId),
      docType: status === 'none' ? '' : decodeBytes32String(r.docType),
      version: Number(r.version),
      prevHash: r.prevHash === ZeroHash ? null : plain(r.prevHash),
      sealedAt: Number(r.sealedAt),
      validFrom: Number(r.validFrom),
      validUntil: Number(r.validUntil),
      supersededBy: next === ZeroHash ? null : plain(next),
      revokeReason: Number(reason),
    };
  }
}

/** Turn a revert into an Error named after the contract's custom error (e.g. "RequestAlreadySealed"). */
function named(c: Contract, e: unknown): Error {
  const err = e as { data?: string; info?: { error?: { data?: string | { data?: string } } }; message?: string };
  const raw = err?.data ?? (typeof err?.info?.error?.data === 'string' ? err.info.error.data : err?.info?.error?.data?.data);
  try {
    const parsed = raw ? c.interface.parseError(raw) : null;
    if (parsed) return new Error(`Contract refused: ${parsed.name}`);
  } catch {
    /* not a contract error */
  }
  return e instanceof Error ? e : new Error(String(e));
}

/** Contract address per network, remembered in the app database so a fresh database gets a fresh contract. */
export function dbAddressStore(db: { prepare: (sql: string) => any }, network: string) {
  const key = `registry_address:${network}`;
  return {
    get: () => db.prepare('SELECT value FROM kv WHERE key = ?').pluck().get(key) as string | undefined,
    set: (address: string) => db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, address),
  };
}

export function chainFromConfig(
  cfg: { chainMode: string; localRpcUrl: string; amoyRpcUrl: string; amoyPrivateKey: string },
  store: (network: string) => ChainOptions['store'],
  onFreshDeploy?: () => void,
) {
  if (cfg.chainMode === 'off') return null;
  if (cfg.chainMode === 'amoy') {
    if (!cfg.amoyPrivateKey) throw new Error('CHAIN_MODE=amoy needs AMOY_PRIVATE_KEY (a funded Amoy test wallet)');
    return new ChainClient({ network: 'amoy', rpcUrl: cfg.amoyRpcUrl, privateKey: cfg.amoyPrivateKey, store: store('amoy'), onFreshDeploy });
  }
  return new ChainClient({ network: 'local', rpcUrl: cfg.localRpcUrl, privateKey: LOCAL_DEV_KEY, store: store('local'), onFreshDeploy });
}
