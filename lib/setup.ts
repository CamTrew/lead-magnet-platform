import { isValidRootDomain, isValidSubdomain } from './dns-records';
import { isValidPlatformUsername } from './platform-username';
import { resolveResendApiKey, resolveResendFromEmail } from './platform-resend';
import type { AccountSettings } from './types';

export type SetupItemKey =
  | 'username'
  | 'logo'
  | 'domain'
  | 'subdomain'
  | 'domainVerified'
  | 'domainAttached'
  | 'returnPath'
  | 'sender'
  | 'resendKey';

export type SetupItem = {
  key: SetupItemKey;
  label: string;
  detail: string;
  done: boolean;
};

/**
 * Decide whether the account has completed enough setup to use the rest of the
 * dashboard. We require:
 * A platform username is enough to publish. Brand, custom domain, and custom
 * sender-domain settings remain optional upgrades.
 *
 * We deliberately do NOT require the sending-DNS records (MX/SPF/DKIM) to
 * be verified here, because they take 1–60 minutes to propagate and we
 * don't want to block the user from publishing while DNS catches up.
 */
export function setupChecklist(account: AccountSettings): SetupItem[] {
  return [
    {
      key: 'username',
      label: 'Choose your Magnets URL',
      detail: 'Pick the username that appears in magnets.so/username/page.',
      done: isValidPlatformUsername(account.username),
    },
    {
      key: 'domain',
      label: 'Set your root domain',
      detail: 'The bare domain you own, e.g. example.com.',
      done: Boolean(account.domain) && isValidRootDomain(account.domain),
    },
    {
      key: 'subdomain',
      label: 'Pick a page subdomain',
      detail: 'The subdomain where pages will be published. We recommend "get".',
      done: Boolean(account.subdomain) && isValidSubdomain(account.subdomain),
    },
    {
      key: 'domainVerified',
      label: 'Verify domain ownership',
      detail: 'Add the magnets-verify TXT record and click Check ownership.',
      done: Boolean(account.domainVerifiedAt),
    },
    {
      key: 'domainAttached',
      label: 'Connect the subdomain',
      detail: 'Once verified, click Connect subdomain to attach it to your account.',
      done: Boolean(account.domainAttachedHost),
    },
    {
      key: 'logo',
      label: 'Add brand identity',
      detail: 'Open Brand and add a business name or logo.',
      done: Boolean(account.logoUrl || account.logoText.trim()),
    },
    {
      key: 'resendKey',
      label: account.resendManagedByPlatform
        ? 'Magnets sending is connected'
        : account.resendConfigured
          ? 'Sending connection is ready'
          : 'Magnets sending is not connected',
      detail: account.resendManagedByPlatform
        ? 'Magnets manages Resend for this account.'
        : account.resendConfigured
          ? 'This account keeps its existing sending connection.'
          : 'Contact support to finish connecting Magnets-managed sending.',
      done: account.resendConfigured,
    },
  ];
}

export function isSetupComplete(account: AccountSettings) {
  // A claimed Magnets URL is enough to create and publish platform-hosted pages.
  // A custom domain remains an optional alternative for established accounts.
  if (process.env.MAGNETS_SKIP_SETUP_GATE === '1') return true;
  return isValidPlatformUsername(account.username) || isPublishingDomainReady(account);
}

export function isPublishingDomainReady(account: AccountSettings) {
  if (process.env.MAGNETS_SKIP_SETUP_GATE === '1') return true;

  return (
    Boolean(account.domain) &&
    isValidRootDomain(account.domain) &&
    Boolean(account.subdomain) &&
    isValidSubdomain(account.subdomain) &&
    Boolean(account.domainVerifiedAt) &&
    Boolean(account.domainAttachedHost)
  );
}

/**
 * Sending is intentionally independent from where the page is hosted. An
 * account can use a verified sending domain while serving its magnet from
 * magnets.so, so do not require domainAttachedHost here.
 */
export function isEmailDeliveryReady(account: AccountSettings) {
  return (
    Boolean(resolveResendApiKey(account)) &&
    Boolean(resolveResendFromEmail(account))
  );
}
