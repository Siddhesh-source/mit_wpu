import type { GlobalSetupContext } from 'vitest/node';
import { startLocalNode } from '@plc/contracts';

/** One local chain for the whole API test run; each test deploys its own fresh contract. */
export default async function ({ provide }: GlobalSetupContext) {
  const node = await startLocalNode(8621);
  provide('rpcUrl', node.url);
  return () => node.stop();
}

declare module 'vitest' {
  export interface ProvidedContext {
    rpcUrl: string;
  }
}
