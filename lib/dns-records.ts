export type DnsRecordType = 'CNAME' | 'MX' | 'TXT';

export type DnsRecordDefinition = {
  id: string;
  type: DnsRecordType;
  name: string;
  lookupName: string;
  value: string;
};

export type ParsedSenderEmail = {
  email: string;
  domain: string;
};

const rootDomainPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const subdomainPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const emailPattern = /^[^\s@<>]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function normaliseRootDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*/, '')
    .replace(/\.$/, '');
}

export function normaliseSubdomain(value: string) {
  return value.trim().toLowerCase();
}

export function isValidRootDomain(value: string) {
  return rootDomainPattern.test(normaliseRootDomain(value));
}

export function isValidSubdomain(value: string) {
  return subdomainPattern.test(normaliseSubdomain(value));
}

export function parseSenderEmail(value: string): ParsedSenderEmail | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const bracketMatch = trimmed.match(/<([^<>@\s]+@[a-z0-9.-]+\.[a-z]{2,})>$/i);
  const email = (bracketMatch?.[1] || trimmed).trim().toLowerCase();

  if (!emailPattern.test(email)) return null;

  const domain = email.split('@')[1];
  if (!domain || !isValidRootDomain(domain)) return null;

  return { email, domain: normaliseRootDomain(domain) };
}

export function expectedSenderDomain(returnPath: string, domain: string) {
  const cleanReturnPath = normaliseSubdomain(returnPath);
  const cleanDomain = normaliseRootDomain(domain);
  if (!cleanReturnPath || !cleanDomain) return '';
  return `${cleanReturnPath}.${cleanDomain}`;
}

export function senderMatchesAccountDomain({
  domain,
  resendFromEmail,
  resendReturnPath,
}: {
  domain: string;
  resendFromEmail: string;
  resendReturnPath: string;
}) {
  if (!resendFromEmail) return true;

  const sender = parseSenderEmail(resendFromEmail);
  const expected = expectedSenderDomain(resendReturnPath, domain);
  if (!sender) return false;

  if (expected) return sender.domain === expected;

  // Older accounts predate the return-path setting. They may already have a
  // verified Resend sender on the root domain or one of its subdomains. Keep
  // those senders valid rather than clearing them the next time an account is
  // saved, while still requiring the account to own the same root domain.
  const rootDomain = normaliseRootDomain(domain);
  return Boolean(
    rootDomain &&
      (sender.domain === rootDomain || sender.domain.endsWith(`.${rootDomain}`))
  );
}

export function buildPageDnsRecords({
  domain,
  subdomain,
  verificationToken,
}: {
  domain: string;
  subdomain: string;
  verificationToken: string;
}): DnsRecordDefinition[] {
  const rootDomain = normaliseRootDomain(domain);
  const pageSubdomain = normaliseSubdomain(subdomain);

  return [
    {
      id: 'page-cname',
      type: 'CNAME',
      name: pageSubdomain,
      lookupName: `${pageSubdomain}.${rootDomain}`,
      value: 'cname.vercel-dns.com',
    },
    buildDomainOwnershipRecord(rootDomain, verificationToken),
  ];
}

export function buildDomainOwnershipRecord(
  domain: string,
  verificationToken: string
): DnsRecordDefinition {
  const rootDomain = normaliseRootDomain(domain);

  return {
    id: 'page-txt',
    type: 'TXT',
    // DNS provider forms normally expect the label relative to the root
    // domain, while server-side resolution always needs the full hostname.
    name: 'magnets-verify',
    lookupName: `magnets-verify.${rootDomain}`,
    value: verificationToken,
  };
}

export function buildEmailDnsRecords(domain: string): DnsRecordDefinition[] {
  const rootDomain = normaliseRootDomain(domain);

  return [
    {
      id: 'email-mx',
      type: 'MX',
      name: `send.${rootDomain}`,
      lookupName: `send.${rootDomain}`,
      value: 'feedback-smtp.us-east-1.amazonses.com',
    },
    {
      id: 'email-spf',
      type: 'TXT',
      name: `send.${rootDomain}`,
      lookupName: `send.${rootDomain}`,
      value: 'v=spf1 include:amazonses.com ~all',
    },
    {
      id: 'email-dmarc',
      type: 'TXT',
      name: `_dmarc.${rootDomain}`,
      lookupName: `_dmarc.${rootDomain}`,
      value: 'v=DMARC1; p=none;',
    },
  ];
}
