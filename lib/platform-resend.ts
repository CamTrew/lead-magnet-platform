import { isMaskedSecret } from './secrets';
import { senderMatchesAccountDomain } from './dns-records';
import type { AccountSettings } from './types';

/**
 * The Magnets-managed Resend key is deliberately server-only. It lets a new
 * account set up sending without creating its own Resend account, while an
 * account that has saved a key continues to use that key instead.
 */
export function platformResendApiKey() {
  return process.env.MAGNETS_RESEND_API_KEY?.trim() || '';
}

export function hasPlatformResendApiKey() {
  return Boolean(platformResendApiKey());
}

/**
 * This address belongs to Magnets and is used when an account has not chosen
 * to send from its own verified domain. It can be changed without a deploy if
 * the platform sender ever needs to move to another verified address.
 */
export function platformResendFromEmail() {
  return process.env.MAGNETS_RESEND_FROM_EMAIL?.trim() || 'Magnets <hello@mail.magnets.so>';
}

type ResendAccount = Pick<
  AccountSettings,
  'domain' | 'domainVerifiedAt' | 'resendApiKey' | 'resendFromEmail' | 'resendReturnPath'
>;

function hasVerifiedAccountSender(account: ResendAccount) {
  return Boolean(
    account.resendFromEmail?.trim() &&
      account.domainVerifiedAt &&
      senderMatchesAccountDomain(account)
  );
}

function hasUsableAccountKey(account: ResendAccount) {
  const accountKey = account.resendApiKey?.trim() || '';
  return Boolean(accountKey && !isMaskedSecret(accountKey));
}

function usesAccountResendWorkspace(account: ResendAccount) {
  return hasUsableAccountKey(account) && hasVerifiedAccountSender(account);
}

export function resolveResendApiKey(account: ResendAccount) {
  const accountKey = account.resendApiKey?.trim() || '';

  // A Resend API key can only send from domains verified in that same Resend
  // account. Use an account-owned key only with its verified account sender.
  // Otherwise, use the Magnets key and Magnets sender together.
  if (usesAccountResendWorkspace(account)) return accountKey;

  return platformResendApiKey() || (hasUsableAccountKey(account) ? accountKey : '');
}

export function usesPlatformResendAccount(account: ResendAccount) {
  return Boolean(platformResendApiKey()) && !usesAccountResendWorkspace(account);
}

/**
 * Customer domains are optional. We only use a stored customer sender once
 * its domain ownership is verified, otherwise Resend delivers from Magnets'
 * verified platform address.
 */
export function resolveResendFromEmail(
  account: ResendAccount
) {
  if (usesAccountResendWorkspace(account)) {
    return account.resendFromEmail.trim();
  }

  return hasPlatformResendApiKey() ? platformResendFromEmail() : '';
}
