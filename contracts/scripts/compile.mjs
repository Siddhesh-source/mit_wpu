// Compiles contracts/*.sol with the solc npm package (no compiler download) into artifacts/<Name>.json.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const solc = createRequire(import.meta.url)('solc');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sources = Object.fromEntries(
  fs.readdirSync(path.join(root, 'contracts')).filter((f) => f.endsWith('.sol')).map((f) => [f, { content: fs.readFileSync(path.join(root, 'contracts', f), 'utf8') }]),
);
const out = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: 'Solidity',
      sources,
      settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
    }),
  ),
);
const errors = (out.errors ?? []).filter((e) => e.severity === 'error');
if (errors.length) {
  console.error(errors.map((e) => e.formattedMessage).join('\n'));
  process.exit(1);
}
for (const [file, contracts] of Object.entries(out.contracts)) {
  for (const [name, c] of Object.entries(contracts)) {
    const artifact = { contractName: name, sourceName: file, compiler: solc.version(), abi: c.abi, bytecode: '0x' + c.evm.bytecode.object };
    fs.writeFileSync(path.join(root, 'artifacts', `${name}.json`), JSON.stringify(artifact, null, 2) + '\n');
    console.log(`compiled ${name} (${c.evm.bytecode.object.length / 2} bytes) with solc ${solc.version()}`);
  }
}
