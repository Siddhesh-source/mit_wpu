import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContractFactory, type Signer } from 'ethers';
import artifact from '../artifacts/DocumentRegistry.json' with { type: 'json' };

export const DocumentRegistryArtifact = artifact as { abi: unknown[]; bytecode: string };
export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Hardhat's well-known first dev account. Local chain only; never use on a public network. */
export const LOCAL_DEV_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

export const STATUS = ['None', 'Active', 'Superseded', 'Revoked'] as const;

export async function deployRegistry(signer: Signer): Promise<string> {
  const factory = new ContractFactory(DocumentRegistryArtifact.abi as never, DocumentRegistryArtifact.bytecode, signer);
  const c = await factory.deploy();
  await c.waitForDeployment();
  return c.getAddress();
}

/** Start `hardhat node` on a port and resolve once it accepts JSON-RPC. Used by tests and `npm run dev`. */
export function startLocalNode(port: number): Promise<{ url: string; stop: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const bin = path.join(ROOT, '..', 'node_modules', '.bin', 'hardhat');
    const child: ChildProcess = spawn(bin, ['node', '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: ROOT,
      env: { ...process.env, HARDHAT_DISABLE_TELEMETRY_PROMPT: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    const timer = setTimeout(() => (child.kill(), reject(new Error(`hardhat node did not start:\n${log}`))), 30_000);
    child.stdout!.on('data', (d) => {
      log += d;
      if (log.includes('Started HTTP')) {
        clearTimeout(timer);
        const stop = () =>
          new Promise<void>((done) => {
            if (child.exitCode !== null) return done();
            child.once('exit', () => done());
            child.kill();
          });
        resolve({ url: `http://127.0.0.1:${port}`, stop });
      }
    });
    child.stderr!.on('data', (d) => (log += d));
    child.on('exit', (code) => code && reject(new Error(`hardhat node exited ${code}:\n${log}`)));
  });
}
