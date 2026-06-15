import { isValidRootDomain, isValidSubdomain, senderMatchesAccountDomain } from './dns-records';
import type { AccountSettings } from './types';

export type SetupItemKey =
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
 *  - a logo
 *  - a valid root domain
 *  - a valid page subdomain
 *  - ownership verified (TXT proof passed)
 *  - the subdomain attached to the project so it actually serves traffic
 *  - a sending subdomain chosen
 *  - a parseable sender address
 *  - a Resend API key stored
 *
 * We deliberately do NOT require the sending-DNS records (MX/SPF/DKIM) to
 * be verified here, because they take 1–60 minutes to propagate and we
 * don't want to block the user from publishing while DNS catches up. The
 * submit endpoint will surface a 502 if Resend rejects the actual send.
 */
export function setupChecklist(account: AccountSettings): SetupItem[] {
  return [
    {
      key: 'domain',
      label: 'Set your root domain',
      detail: 'The bare domain you own, e.g. example.com.',
      done: Boolean(account.domain) && isValidRootDomain(account.domain),
    },
    {
      key: 'subdomain',
      label: 'Pick a page subdomain',
      detail: 'The subdomain pages will publish at — usually "get".',
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
      label: 'Upload your logo',
      detail: 'Open Brand after your domain is connected.',
      done: Boolean(account.logoUrl),
    },
    {
      key: 'resendKey',
      label: 'Add a sending key',
      detail: 'Without this, no email can be sent. Free at resend.com.',
      done: Boolean(account.resendApiKey),
    },
    {
      key: 'returnPath',
      label: 'Pick a sending subdomain',
      detail: 'In Delivery, click "Find a clear subdomain" and save.',
      done: Boolean(account.resendReturnPath),
    },
    {
      key: 'sender',
      label: 'Set your sender address',
      detail: 'In Delivery, pick the local part of your "from" email.',
      done: Boolean(account.resendFromEmail) && senderMatchesAccountDomain(account),
    },
  ];
}

export function isSetupComplete(account: AccountSettings) {
  // Escape hatch for local testing — set MAGNETS_SKIP_SETUP_GATE=1 in .env.local
  // to access Pages and Signups before finishing Configure. Production deploys
  // should never set this; the gate exists to stop people from creating magnets
  // that can't actually send email.
  if (process.env.MAGNETS_SKIP_SETUP_GATE === '1') return true;
  return setupChecklist(account).every((item) => item.done);
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
