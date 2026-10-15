import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(resolve('scripts/upgrade-follow-up-renderer.ts'), 'utf8');
const compiled = ts.transpileModule(source.replace('void main();', 'main();'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

async function runUpgrade(args: string[], production: boolean, brokenSender: boolean) {
  const processStub = {
    argv: ['node', 'upgrade-follow-up-renderer.ts', ...args],
    env: { VERCEL_ENV: production ? 'production' : 'preview' },
    exitCode: undefined as number | undefined,
    exit: () => { throw new Error('Skipped production upgrade'); },
  };
  let writes = 0;
  let syncs = 0;
  const reports: Array<{ failed: number; upgraded: number }> = [];
  const targets = [
    { id: 'broken', accountId: 'account-broken', resendFollowUpRenderVersion: 10 },
    { id: 'healthy', accountId: 'account-healthy', resendFollowUpRenderVersion: 10 },
  ];
  const modules = {
    '../lib/platform-store': {
      listEnabledFollowUpAutomationTargets: async () => targets,
      getAccountWithSecrets: async () => ({}),
      updateLeadMagnetFollowUpSync: async (_accountId: string, magnetId: string) => {
        assert.ok(!brokenSender || magnetId !== 'broken', 'Failed targets must retain their stored version');
        writes += 1;
      },
    },
    '../lib/follow-up-sequences': {
      FOLLOW_UP_RENDER_VERSION: 11,
      followUpAutomationNeedsProviderSync: () => true,
      syncLeadMagnetFollowUpAutomation: async (_account: unknown, magnet: { id: string }) => {
        syncs += 1;
        if (brokenSender && magnet.id === 'broken') throw new Error('Sender domain is not verified');
        return { emails: [], automationId: 'automation', renderVersion: 11 };
      },
    },
    '../lib/platform-resend': {
      resolveResendApiKey: () => 'mock-key',
      resolveResendFromEmail: () => 'hello@example.com',
    },
  };
  await runInNewContext(compiled, {
    exports: {},
    require: (name: keyof typeof modules) => {
      assert.ok(name in modules, `Unexpected dependency: ${name}`);
      return modules[name];
    },
    process: processStub,
    console: { log: (report: string) => reports.push(JSON.parse(report)) },
  });
  return { exitCode: processStub.exitCode, writes, syncs, report: reports.at(-1) };
}

async function main() {
  const production = await runUpgrade(['--apply-if-production'], true, true);
  assert.equal(production.exitCode, undefined);
  assert.equal(production.report?.failed, 1);
  assert.equal(production.report?.upgraded, 1);
  assert.equal(production.writes, 1);
  assert.equal(production.syncs, 2, 'One failing account must not suppress the next account');

  const maintenance = await runUpgrade(['--apply'], false, true);
  assert.equal(maintenance.exitCode, 1);
  assert.equal(maintenance.writes, 1);

  const successful = await runUpgrade(['--apply-if-production'], true, false);
  assert.equal(successful.report?.failed, 0);
  assert.equal(successful.report?.upgraded, 2);
  assert.equal(successful.writes, 2);
  console.log('Follow-up upgrade smoke test passed: production reports failures, healthy targets continue, and manual maintenance remains strict.');
}

void main();
