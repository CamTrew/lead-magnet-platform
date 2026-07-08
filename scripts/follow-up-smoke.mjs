import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const tsxCli = resolve(projectRoot, 'node_modules/.pnpm/tsx@4.22.4/node_modules/tsx/dist/cli.mjs');
const smokeTest = resolve(projectRoot, 'scripts/follow-up-smoke.ts');

if (!existsSync(tsxCli)) {
  console.error('Could not find the local tsx runner. Run npm install or pnpm install first.');
  process.exit(1);
}

const result = spawnSync(process.execPath, [tsxCli, smokeTest], {
  cwd: projectRoot,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
