import {
  getAccountWithSecrets,
  listEnabledFollowUpAutomationTargets,
  updateLeadMagnetFollowUpSync,
} from '../lib/platform-store';
import {
  FOLLOW_UP_RENDER_VERSION,
  followUpAutomationNeedsProviderSync,
  syncLeadMagnetFollowUpAutomation,
} from '../lib/follow-up-sequences';
import { resolveResendApiKey } from '../lib/platform-resend';

const apply = process.argv.includes('--apply');

async function main() {
  const enabled = await listEnabledFollowUpAutomationTargets();
  const targets = enabled.filter(followUpAutomationNeedsProviderSync);
  const report: Array<Record<string, unknown>> = [];
  let upgraded = 0;
  let failed = 0;

  for (const magnet of targets) {
    const account = await getAccountWithSecrets(magnet.accountId);
    const ready = Boolean(account && resolveResendApiKey(account));

    if (!apply) {
      report.push({
        accountId: magnet.accountId,
        magnetId: magnet.id,
        fromVersion: Number(magnet.resendFollowUpRenderVersion || 0),
        hasAutomation: Boolean(magnet.resendFollowUpAutomationId),
        ready,
      });
      continue;
    }

    if (!account || !ready) {
      failed += 1;
      report.push({
        accountId: magnet.accountId,
        magnetId: magnet.id,
        result: 'failed',
        error: 'Sending is not configured for this account.',
      });
      continue;
    }

    try {
      // The sync creates new templates and a replacement Automation. Resend
      // keeps runs on the stopped Automation alive, so existing subscribers
      // finish the exact sequence they entered while new signups use v6.
      const result = await syncLeadMagnetFollowUpAutomation(account, magnet);
      await updateLeadMagnetFollowUpSync(account.id, magnet.id, {
        followUpEmails: result.emails,
        resendFollowUpAutomationId: result.automationId,
        resendFollowUpRenderVersion: result.renderVersion,
      });
      upgraded += 1;
      report.push({
        accountId: magnet.accountId,
        magnetId: magnet.id,
        result: 'upgraded',
        fromVersion: Number(magnet.resendFollowUpRenderVersion || 0),
        toVersion: result.renderVersion,
      });
    } catch (error) {
      failed += 1;
      report.push({
        accountId: magnet.accountId,
        magnetId: magnet.id,
        result: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry_run',
    rendererVersion: FOLLOW_UP_RENDER_VERSION,
    enabledCount: enabled.length,
    targetCount: targets.length,
    upgraded,
    failed,
    report,
  }, null, 2));

  if (failed > 0) process.exitCode = 1;
}

void main();
