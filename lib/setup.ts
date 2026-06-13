import { isValidRootDomain, isValidSubdomain, parseSenderEmail } from './dns-records';
import type { AccountSettings } from './types';

export type SetupItemKey = 'domain' | 'subdomain' | 'sender' | 'resendKey';

export type SetupItem = {
  key: SetupItemKey;
  label: string;
  detail: string;
  done: boolean;
};

/**
 * Decide whether the account has completed enough setup to use the rest of the
 * dashboard. We require all four of: a valid root domain, a valid subdomain,
 * a parseable sender email, and a Resend API key (the redacted dashboard payload
 * surfaces a stored key as the literal '********').
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
      key: 'sender',
      label: 'Add a sender email',
      detail: 'The "From" address on the email people receive, e.g. Your Brand <hello@example.com>.',
      done: Boolean(account.resendFromEmail) && parseSenderEmail(account.resendFromEmail) !== null,
    },
    {
      key: 'resendKey',
      label: 'Connect a Resend API key',
      detail: 'Without this, no email can be sent. Free at resend.com.',
      done: Boolean(account.resendApiKey),
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
