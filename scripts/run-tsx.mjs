import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const projectRoot = process.cwd();
const tsxCli = resolve(projectRoot, 'node_modules/.pnpm/tsx@4.22.4/node_modules/tsx/dist/cli.mjs');
const script = process.argv[2];
const scriptArgs = process.argv.slice(3);

if (!script || !existsSync(tsxCli)) {
  console.error('Could not find the local tsx runner or requested script. Run pnpm install first.');
  process.exit(1);
}

const result = spawnSync(process.execPath, [tsxCli, script, ...scriptArgs], {
  cwd: projectRoot,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
