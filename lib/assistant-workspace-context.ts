import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import type { AccountSettings, DashboardBasePayload, LeadMagnet } from './types';

// Only an authenticated workspace MCP dispatcher may enter this context. It is
// request-local, never populated from client headers, cookies or tool arguments.
export const assistantWorkspaceContext = new AsyncLocalStorage<{
  payload: DashboardBasePayload;
  expectedMagnetVersion?: string;
  expectedAccountVersion?: string;
  confirmLiveEdit?: boolean;
}>();
export const workspaceMagnetVersion = (magnet: LeadMagnet) => createHash('sha256').update(JSON.stringify(magnet)).digest('hex');
export const ACCOUNT_EDIT_FIELDS = ['username','subdomain','domain','logoUrl','logoText','brand','resendFromEmail','resendReturnPath','beehiivPublicationId','substackPublication','calendarWebhookEnabled'] as const;
export function workspaceAccountVersion(account: AccountSettings) {
  return createHash('sha256').update(JSON.stringify([account.id, account.updatedAt, ...ACCOUNT_EDIT_FIELDS.map(key => account[key])])).digest('hex');
}
