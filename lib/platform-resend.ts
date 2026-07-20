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

export function resolveResendApiKey(account: ResendAccount) {
  const accountKey = account.resendApiKey?.trim() || '';

  // A verified custom sender can belong either to a customer-owned Resend
  // workspace or to the Magnets-managed workspace. Prefer an explicit
  // customer key, but keep using the platform key for accounts whose custom
  // domain was created and verified through the managed setup flow.
  if (hasVerifiedAccountSender(account)) {
    return hasUsableAccountKey(account) ? accountKey : platformResendApiKey();
  }

  return platformResendApiKey() || (hasUsableAccountKey(account) ? accountKey : '');
}

export function usesPlatformResendAccount(account: ResendAccount) {
  if (!platformResendApiKey()) return false;
  // Before a custom sender is verified, the resolver deliberately stays on
  // the protected platform sender even if the user has pasted a customer key.
  // Once verified, an explicit customer key owns the sender; otherwise the
  // same custom address remains managed by Magnets.
  return !hasVerifiedAccountSender(account) || !hasUsableAccountKey(account);
}

/**
 * Customer domains are optional. We only use a stored customer sender once
 * its domain ownership is verified, otherwise Resend delivers from Magnets'
 * verified platform address.
 */
export function resolveResendFromEmail(
  account: ResendAccount
) {
  if (hasVerifiedAccountSender(account)) {
    return resolveResendApiKey(account) ? account.resendFromEmail.trim() : '';
  }

  return hasPlatformResendApiKey() ? platformResendFromEmail() : '';
}
