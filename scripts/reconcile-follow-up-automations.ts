import { createHash } from 'node:crypto';
import {
  getAccountWithSecrets,
  listEnabledFollowUpAutomationTargets,
  updateLeadMagnetFollowUpSync,
} from '../lib/platform-store';
import { resolveResendApiKey } from '../lib/platform-resend';

type JsonRecord = Record<string, unknown>;

type ProviderAutomation = {
  id: string;
  status: string;
  createdAt: string;
  triggerEvent: string;
  subjects: string[];
};

const apply = process.argv.includes('--apply');
let lastRequestAt = 0;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? value as JsonRecord : {};
}

function fingerprint(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 10);
}

async function throttle() {
  const remaining = 250 - (Date.now() - lastRequestAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  lastRequestAt = Date.now();
}

async function resendRequest(apiKey: string, path: string, init: RequestInit = {}) {
  await throttle();
  const response = await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Resend ${init.method || 'GET'} ${path} returned ${response.status}`);
  }
  return record(payload);
}

function automationDetail(value: JsonRecord): ProviderAutomation | null {
  const id = String(value.id || '');
  const steps = Array.isArray(value.steps) ? value.steps.map(record) : [];
  const trigger = steps.find((step) => step.type === 'trigger');
  const triggerEvent = String(record(trigger?.config).event_name || '');
  if (!id || !triggerEvent) return null;

  return {
    id,
    status: String(value.status || ''),
    createdAt: String(value.created_at || ''),
    triggerEvent,
    subjects: steps
      .filter((step) => step.type === 'send_email')
      .map((step) => String(record(step.config).subject || '')),
  };
}

async function main() {
  const targets = await listEnabledFollowUpAutomationTargets();
  const accounts = new Map<string, Awaited<ReturnType<typeof getAccountWithSecrets>>>();
  for (const target of targets) {
    if (!accounts.has(target.accountId)) {
      accounts.set(target.accountId, await getAccountWithSecrets(target.accountId));
    }
  }

  const providerGroups = new Map<string, { apiKey: string; targets: typeof targets }>();
  for (const target of targets) {
    const account = accounts.get(target.accountId);
    const apiKey = account ? resolveResendApiKey(account) : '';
    if (!apiKey) continue;
    const key = fingerprint(apiKey);
    const group = providerGroups.get(key) || { apiKey, targets: [] };
    if (!group.targets.some((item) => item.id === target.id)) group.targets.push(target);
    providerGroups.set(key, group);
  }

  const report: JsonRecord[] = [];
  let disabledCount = 0;
  let repairedDatabaseCount = 0;

  for (const [provider, group] of providerGroups) {
    const listing = await resendRequest(group.apiKey, '/automations');
    const listed = Array.isArray(listing.data) ? listing.data.map(record) : [];
    const enabledDetails: ProviderAutomation[] = [];

    for (const item of listed) {
      if (item.status !== 'enabled') continue;
      const id = String(item.id || '');
      if (!id) continue;
      const detail = automationDetail(await resendRequest(
        group.apiKey,
        `/automations/${encodeURIComponent(id)}`
      ));
      if (detail) enabledDetails.push(detail);
    }

    for (const target of group.targets) {
      const triggerEvent = `magnets.lead_magnet.${target.id}.signup`;
      const matching = enabledDetails.filter((automation) => automation.triggerEvent === triggerEvent);
      if (matching.length <= 1) continue;

      const expectedSubjects = target.followUpEmails
        .filter((email) => email.subject.trim() && email.body.trim())
        .map((email) => email.subject.trim());
      const graphMatches = matching.filter((automation) =>
        JSON.stringify(automation.subjects) === JSON.stringify(expectedSubjects)
      );
      const persisted = matching.find((automation) =>
        automation.id === target.resendFollowUpAutomationId
      );
      const keep = persisted && graphMatches.some((automation) => automation.id === persisted.id)
        ? persisted
        : graphMatches.length === 1
          ? graphMatches[0]
          : null;

      if (!keep) {
        report.push({
          provider,
          magnetId: target.id,
          result: 'manual_review',
          persistedAutomationId: target.resendFollowUpAutomationId,
          enabledAutomationIds: matching.map((automation) => automation.id),
          matchingCurrentGraphIds: graphMatches.map((automation) => automation.id),
        });
        continue;
      }

      const extras = matching.filter((automation) => automation.id !== keep.id);
      const runningRuns: Record<string, number> = {};
      for (const extra of extras) {
        const runs = await resendRequest(
          group.apiKey,
          `/automations/${encodeURIComponent(extra.id)}/runs?limit=100&status=running`
        );
        runningRuns[extra.id] = Array.isArray(runs.data) ? runs.data.length : 0;
      }

      if (apply) {
        for (const extra of extras) {
          await resendRequest(group.apiKey, `/automations/${encodeURIComponent(extra.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'disabled' }),
          });
          disabledCount += 1;
        }

        if (target.resendFollowUpAutomationId !== keep.id) {
          await updateLeadMagnetFollowUpSync(target.accountId, target.id, {
            followUpEmails: target.followUpEmails,
            resendFollowUpAutomationId: keep.id,
            resendFollowUpRenderVersion: target.resendFollowUpRenderVersion,
          });
          repairedDatabaseCount += 1;
        }
      }

      report.push({
        provider,
        magnetId: target.id,
        result: apply ? 'reconciled' : 'would_reconcile',
        keepAutomationId: keep.id,
        disableAutomationIds: extras.map((automation) => automation.id),
        runningRunsOnDuplicates: runningRuns,
        repairedDatabaseId: target.resendFollowUpAutomationId !== keep.id,
      });
    }
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry_run',
    targetCount: targets.length,
    providerCount: providerGroups.size,
    duplicateGroups: report.length,
    disabledCount,
    repairedDatabaseCount,
    report,
  }, null, 2));
}

void main();
