import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getAccountWithSecrets,
  listEnabledFollowUpAutomationTargets,
  updateAccountResendApiKey,
  updateLeadMagnetFollowUpSync,
} from '../lib/platform-store';
import { syncLeadMagnetFollowUpAutomation } from '../lib/follow-up-sequences';
import { senderMatchesAccountDomain } from '../lib/dns-records';

function loadLocalEnvironment() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;

  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    const value = rawValue.replace(/^(['"])(.*)\1$/, '$2');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadLocalEnvironment();

async function main() {
  const targets = await listEnabledFollowUpAutomationTargets();
  const suppliedAccountId = process.env.RESEND_ACCOUNT_ID?.trim() || '';
  const suppliedResendApiKey = process.env.RESEND_ACCOUNT_API_KEY?.trim() || '';
  let synced = 0;
  let failed = 0;

  for (const magnet of targets) {
    let account = await getAccountWithSecrets(magnet.accountId);
    if (!account) {
      failed += 1;
      console.error(`Skipped ${magnet.id}: account not found.`);
      continue;
    }

    if (!account.resendApiKey && suppliedResendApiKey && magnet.accountId === suppliedAccountId) {
      await updateAccountResendApiKey(magnet.accountId, suppliedResendApiKey);
      account = await getAccountWithSecrets(magnet.accountId);
    }

    if (!account?.resendApiKey) {
      failed += 1;
      console.error(`Skipped ${magnet.id}: no Resend API key is saved for this account.`);
      continue;
    }

    if (process.env.DIAGNOSE_READINESS === 'true') {
      const expectedHost = account.subdomain && account.domain
        ? `${account.subdomain}.${account.domain}`.toLowerCase()
        : '';
      console.log({
        accountId: account.id,
        resendKeySaved: Boolean(account.resendApiKey),
        domainVerified: Boolean(account.domainVerifiedAt),
        attachedHostMatches: account.domainAttachedHost.toLowerCase() === expectedHost,
        senderConfigured: Boolean(account.resendFromEmail),
        returnPathConfigured: Boolean(account.resendReturnPath),
        senderMatchesDomain: senderMatchesAccountDomain(account),
      });
    }

    if (process.env.DIAGNOSE_ONLY === 'true') {
      continue;
    }

    try {
      // This only updates the existing Resend templates and automation graph.
      // It neither emits a signup event nor creates/restarts a contact run.
      const result = await syncLeadMagnetFollowUpAutomation(account, magnet);
      await updateLeadMagnetFollowUpSync(account.id, magnet.id, {
        followUpEmails: result.emails,
        resendFollowUpAutomationId: result.automationId,
      });
      synced += 1;
      console.log(`Synced ${magnet.id}`);
    } catch (error) {
      failed += 1;
      console.error(`Could not sync ${magnet.id}:`, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  console.log(`Completed follow-up opt-out sync: ${synced} synced, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

void main();
