import { createHash, randomBytes } from 'node:crypto';
import { query, type QueryRunner, withTransaction } from './db';
import { normaliseBrandHighlightIntensity } from './brand-highlight';
import { senderMatchesAccountDomain } from './dns-records';
import { MAX_LEAD_MAGNETS_PER_ACCOUNT } from './limits';
import {
  decryptSecret,
  encryptSecret,
  isMaskedSecret,
  redactSecret,
} from './secrets';
import type {
  AccountSettings,
  AccountSignup,
  BrandSettings,
  DashboardPayload,
  LeadMagnet,
  PlatformUser,
  Submission,
} from './types';

const defaultBrand: BrandSettings = {
  primary: '#8b76e8',
  accent: '#d8c8ff',
  success: '#22c55e',
  highlightIntensity: 100,
};

export class LeadMagnetLimitError extends Error {
  constructor() {
    super(`Accounts are limited to ${MAX_LEAD_MAGNETS_PER_ACCOUNT} pages.`);
    this.name = 'LeadMagnetLimitError';
  }
}

type UserRow = {
  id: string;
  email: string;
  name: string;
  created_at: Date;
  updated_at: Date;
};

type AccountRow = {
  id: string;
  owner_user_id: string;
  subdomain: string;
  domain: string;
  logo_url: string;
  logo_text: string;
  brand: BrandSettings | string | null;
  resend_from_email: string;
  resend_api_key: string;
  beehiiv_api_key: string;
  beehiiv_publication_id: string;
  substack_publication: string;
  resend_return_path: string;
  domain_verification_token: string;
  domain_verified_at: Date | null;
  domain_attached_host: string;
  domain_recommended_cname: string;
  onboarding_completed_at: Date | null;
  onboarding_business_name: string;
  onboarding_business_type: string;
  onboarding_magnet_type: string;
  onboarding_cadence: string;
  created_at: Date;
  updated_at: Date;
};

type CredentialRow = {
  user_id: string;
  password_hash: string;
};

type LeadMagnetRow = {
  id: string;
  account_id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  bullets: string[] | string | null;
  bullets_heading: string;
  cta_text: string;
  form_heading: string;
  form_subtext: string;
  image_url: string;
  download_link: string;
  email_subject: string;
  email_body: string;
  email_preview: string;
  published: boolean;
  created_at: Date;
  updated_at: Date;
};

type SubmissionRow = {
  id: string;
  account_id: string;
  lead_magnet_id: string;
  name: string;
  email: string;
  created_at: Date;
};

type UserWithCredentialRow = UserRow & {
  password_hash: string | null;
};

type UserWithSessionRow = UserRow & {
  existing_password_hash: string | null;
  session_token: string | null;
};

type DashboardBaseRow = {
  user_id: string;
  user_email: string;
  user_name: string;
  user_created_at: Date;
  user_updated_at: Date;
  account_id: string;
  account_owner_user_id: string;
  account_subdomain: string;
  account_domain: string;
  account_logo_url: string;
  account_logo_text: string;
  account_brand: BrandSettings | string | null;
  account_resend_from_email: string;
  account_resend_api_key: string;
  account_beehiiv_api_key: string;
  account_beehiiv_publication_id: string;
  account_substack_publication: string;
  account_resend_return_path: string;
  account_domain_verification_token: string;
  account_domain_verified_at: Date | null;
  account_domain_attached_host: string;
  account_domain_recommended_cname: string;
  account_onboarding_completed_at: Date | null;
  account_onboarding_business_name: string;
  account_onboarding_business_type: string;
  account_onboarding_magnet_type: string;
  account_onboarding_cadence: string;
  account_created_at: Date;
  account_updated_at: Date;
};

type DashboardPayloadRow = DashboardBaseRow & {
  lead_magnets: LeadMagnetRow[] | string | null;
};

type PublicLeadMagnetLookupRow = {
  account: AccountRow;
  lead_magnet: LeadMagnetRow;
};

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseBrand(value: AccountRow['brand']): BrandSettings {
  if (!value) return defaultBrand;
  let parsed: Partial<BrandSettings>;

  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return defaultBrand;
  }

  return {
    primary: parsed.primary || defaultBrand.primary,
    accent: parsed.accent || defaultBrand.accent,
    success: parsed.success || defaultBrand.success,
    highlightIntensity: normaliseBrandHighlightIntensity(parsed.highlightIntensity),
  };
}

function parseBullets(value: LeadMagnetRow['bullets']) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function mapUser(row: UserRow): PlatformUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapAccount(row: AccountRow, options: { revealSecrets?: boolean } = {}): AccountSettings {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    subdomain: row.subdomain,
    domain: row.domain,
    logoUrl: row.logo_url,
    logoText: row.logo_text,
    brand: parseBrand(row.brand),
    resendFromEmail: row.resend_from_email,
    resendApiKey: options.revealSecrets
      ? decryptSecret(row.resend_api_key)
      : redactSecret(row.resend_api_key),
    beehiivApiKey: options.revealSecrets
      ? decryptSecret(row.beehiiv_api_key)
      : redactSecret(row.beehiiv_api_key),
    beehiivPublicationId: row.beehiiv_publication_id,
    substackPublication: row.substack_publication,
    resendReturnPath: row.resend_return_path,
    domainVerificationToken: row.domain_verification_token,
    domainVerifiedAt: row.domain_verified_at ? iso(row.domain_verified_at) : null,
    domainAttachedHost: row.domain_attached_host,
    domainRecommendedCname: row.domain_recommended_cname,
    onboardingCompletedAt: row.onboarding_completed_at ? iso(row.onboarding_completed_at) : null,
    onboarding: {
      businessName: row.onboarding_business_name,
      businessType: row.onboarding_business_type,
      magnetType: row.onboarding_magnet_type,
      cadence: row.onboarding_cadence,
    },
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapLeadMagnet(row: LeadMagnetRow): LeadMagnet {
  return {
    id: row.id,
    accountId: row.account_id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    bullets: parseBullets(row.bullets),
    bulletsHeading: row.bullets_heading,
    ctaText: row.cta_text,
    formHeading: row.form_heading,
    formSubtext: row.form_subtext,
    imageUrl: row.image_url,
    downloadLink: row.download_link,
    emailSubject: row.email_subject,
    emailBody: row.email_body,
    emailPreview: row.email_preview,
    published: row.published,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapSubmission(row: SubmissionRow): Submission {
  return {
    id: row.id,
    accountId: row.account_id,
    leadMagnetId: row.lead_magnet_id,
    name: row.name,
    email: row.email,
    createdAt: iso(row.created_at),
  };
}

function mapDashboardBase(row: DashboardBaseRow) {
  return {
    user: mapUser({
      id: row.user_id,
      email: row.user_email,
      name: row.user_name,
      created_at: row.user_created_at,
      updated_at: row.user_updated_at,
    }),
    account: mapAccount({
      id: row.account_id,
      owner_user_id: row.account_owner_user_id,
      subdomain: row.account_subdomain,
      domain: row.account_domain,
      logo_url: row.account_logo_url,
      logo_text: row.account_logo_text,
      brand: row.account_brand,
      resend_from_email: row.account_resend_from_email,
      resend_api_key: row.account_resend_api_key,
      beehiiv_api_key: row.account_beehiiv_api_key,
      beehiiv_publication_id: row.account_beehiiv_publication_id,
      substack_publication: row.account_substack_publication,
      resend_return_path: row.account_resend_return_path,
      domain_verification_token: row.account_domain_verification_token,
      domain_verified_at: row.account_domain_verified_at,
      domain_attached_host: row.account_domain_attached_host,
      domain_recommended_cname: row.account_domain_recommended_cname,
      onboarding_completed_at: row.account_onboarding_completed_at,
      onboarding_business_name: row.account_onboarding_business_name,
      onboarding_business_type: row.account_onboarding_business_type,
      onboarding_magnet_type: row.account_onboarding_magnet_type,
      onboarding_cadence: row.account_onboarding_cadence,
      created_at: row.account_created_at,
      updated_at: row.account_updated_at,
    }),
  };
}

function parseLeadMagnetRows(value: DashboardPayloadRow['lead_magnets']) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(mapLeadMagnet);

  try {
    const parsed = JSON.parse(value) as LeadMagnetRow[];
    return Array.isArray(parsed) ? parsed.map(mapLeadMagnet) : [];
  } catch {
    return [];
  }
}

function mapDashboardPayload(row: DashboardPayloadRow): DashboardPayload {
  return {
    ...mapDashboardBase(row),
    leadMagnets: parseLeadMagnetRows(row.lead_magnets),
  };
}

async function getDashboardBaseByUserId(userId: string) {
  const result = await query<DashboardPayloadRow>(
    `
      with user_row as (
        select
          id,
          email,
          name,
          "createdAt" as created_at,
          "updatedAt" as updated_at
        from neon_auth."user"
        where id = $1::uuid
        limit 1
      ),
      inserted_account as (
        insert into public.magnets_accounts (owner_user_id)
        select id from user_row
        on conflict (owner_user_id) do nothing
        returning *
      ),
      account_row as (
        select * from inserted_account
        union all
        select a.*
        from public.magnets_accounts a
        join user_row u on u.id = a.owner_user_id
        where not exists (select 1 from inserted_account)
        limit 1
      )
      select
        u.id as user_id,
        u.email as user_email,
        u.name as user_name,
        u.created_at as user_created_at,
        u.updated_at as user_updated_at,
        a.id as account_id,
        a.owner_user_id as account_owner_user_id,
        a.subdomain as account_subdomain,
        a.domain as account_domain,
        a.logo_url as account_logo_url,
        a.logo_text as account_logo_text,
        a.brand as account_brand,
        a.resend_from_email as account_resend_from_email,
        a.resend_api_key as account_resend_api_key,
        a.beehiiv_api_key as account_beehiiv_api_key,
        a.beehiiv_publication_id as account_beehiiv_publication_id,
        a.substack_publication as account_substack_publication,
        a.resend_return_path as account_resend_return_path,
        a.domain_verification_token as account_domain_verification_token,
        a.domain_verified_at as account_domain_verified_at,
        a.domain_attached_host as account_domain_attached_host,
        a.domain_recommended_cname as account_domain_recommended_cname,
        a.onboarding_completed_at as account_onboarding_completed_at,
        a.onboarding_business_name as account_onboarding_business_name,
        a.onboarding_business_type as account_onboarding_business_type,
        a.onboarding_magnet_type as account_onboarding_magnet_type,
        a.onboarding_cadence as account_onboarding_cadence,
        a.created_at as account_created_at,
        a.updated_at as account_updated_at,
        coalesce(
          (
            select jsonb_agg(to_jsonb(lm) order by lm.updated_at desc)
            from public.magnets_lead_magnets lm
            where lm.account_id = a.id
          ),
          '[]'::jsonb
        ) as lead_magnets
      from user_row u
      join account_row a on true
    `,
    [userId]
  );

  return result.rows[0] ? mapDashboardPayload(result.rows[0]) : null;
}

async function getDashboardBaseBySessionToken(token: string) {
  const result = await query<DashboardPayloadRow>(
    `
      with user_row as (
        select
          u.id,
          u.email,
          u.name,
          u."createdAt" as created_at,
          u."updatedAt" as updated_at
        from neon_auth.session s
        join neon_auth."user" u on u.id = s."userId"
        where s.token = any($1::text[])
          and s."expiresAt" > now()
          and coalesce(u.banned, false) = false
        limit 1
      ),
      inserted_account as (
        insert into public.magnets_accounts (owner_user_id)
        select id from user_row
        on conflict (owner_user_id) do nothing
        returning *
      ),
      account_row as (
        select * from inserted_account
        union all
        select a.*
        from public.magnets_accounts a
        join user_row u on u.id = a.owner_user_id
        where not exists (select 1 from inserted_account)
        limit 1
      )
      select
        u.id as user_id,
        u.email as user_email,
        u.name as user_name,
        u.created_at as user_created_at,
        u.updated_at as user_updated_at,
        a.id as account_id,
        a.owner_user_id as account_owner_user_id,
        a.subdomain as account_subdomain,
        a.domain as account_domain,
        a.logo_url as account_logo_url,
        a.logo_text as account_logo_text,
        a.brand as account_brand,
        a.resend_from_email as account_resend_from_email,
        a.resend_api_key as account_resend_api_key,
        a.beehiiv_api_key as account_beehiiv_api_key,
        a.beehiiv_publication_id as account_beehiiv_publication_id,
        a.substack_publication as account_substack_publication,
        a.resend_return_path as account_resend_return_path,
        a.domain_verification_token as account_domain_verification_token,
        a.domain_verified_at as account_domain_verified_at,
        a.domain_attached_host as account_domain_attached_host,
        a.domain_recommended_cname as account_domain_recommended_cname,
        a.onboarding_completed_at as account_onboarding_completed_at,
        a.onboarding_business_name as account_onboarding_business_name,
        a.onboarding_business_type as account_onboarding_business_type,
        a.onboarding_magnet_type as account_onboarding_magnet_type,
        a.onboarding_cadence as account_onboarding_cadence,
        a.created_at as account_created_at,
        a.updated_at as account_updated_at,
        coalesce(
          (
            select jsonb_agg(to_jsonb(lm) order by lm.updated_at desc)
            from public.magnets_lead_magnets lm
            where lm.account_id = a.id
          ),
          '[]'::jsonb
        ) as lead_magnets
      from user_row u
      join account_row a on true
    `,
    [[token, sessionTokenHash(token)]]
  );

  return result.rows[0] ? mapDashboardPayload(result.rows[0]) : null;
}

export async function ensureUser(email: string, name?: string): Promise<PlatformUser> {
  const normalizedEmail = email.trim().toLowerCase();
  const displayName = name?.trim() || normalizedEmail.split('@')[0] || 'User';
  const user = await query<UserRow>(
    `
      with user_row as (
        insert into neon_auth."user" (email, name, "emailVerified")
        values ($1, $2, false)
        on conflict (email) do update
          set name = excluded.name,
              "updatedAt" = now()
        returning id, email, name, "createdAt" as created_at, "updatedAt" as updated_at
      ),
      account_row as (
        insert into public.magnets_accounts (owner_user_id)
        select id from user_row
        on conflict (owner_user_id) do nothing
      )
      select id, email, name, created_at, updated_at
      from user_row
    `,
    [normalizedEmail, displayName]
  );

  return mapUser(user.rows[0]);
}

export async function findUserByEmail(email: string): Promise<PlatformUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const result = await query<UserRow>(
    `
      select
        id,
        email,
        name,
        "createdAt" as created_at,
        "updatedAt" as updated_at
      from neon_auth."user"
      where email = $1
      limit 1
    `,
    [normalizedEmail]
  );

  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function updateUserName(userId: string, name: string): Promise<PlatformUser | null> {
  const result = await query<UserRow>(
    `
      update neon_auth."user"
      set
        name = $2,
        "updatedAt" = now()
      where id = $1
      returning
        id,
        email,
        name,
        "createdAt" as created_at,
        "updatedAt" as updated_at
    `,
    [userId, name.trim()]
  );

  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function findUserWithPasswordByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const result = await query<UserWithCredentialRow>(
    `
      select
        u.id,
        u.email,
        u.name,
        u."createdAt" as created_at,
        u."updatedAt" as updated_at,
        c.password_hash
      from neon_auth."user" u
      left join public.magnets_auth_credentials c on c.user_id = u.id
      where u.email = $1
      limit 1
    `,
    [normalizedEmail]
  );
  const row = result.rows[0];

  return row
    ? {
        user: mapUser(row),
        passwordHash: row.password_hash,
      }
    : null;
}

export async function createUserWithPasswordSession(
  email: string,
  passwordHash: string,
  name?: string
) {
  const normalizedEmail = email.trim().toLowerCase();
  const displayName = name?.trim() || normalizedEmail.split('@')[0] || 'User';
  const token = randomBytes(32).toString('hex');
  const storedToken = sessionTokenHash(token);

  const result = await query<UserWithSessionRow>(
    `
      with inserted_user as (
        insert into neon_auth."user" (email, name, "emailVerified")
        values ($1, $2, false)
        on conflict (email) do nothing
        returning
          id,
          email,
          name,
          "createdAt" as created_at,
          "updatedAt" as updated_at
      ),
      existing_user as (
        select
          id,
          email,
          name,
          "createdAt" as created_at,
          "updatedAt" as updated_at
        from neon_auth."user"
        where email = $1
          and not exists (select 1 from inserted_user)
        limit 1
      ),
      user_row as (
        select * from inserted_user
        union all
        select * from existing_user
      ),
      existing_credential as (
        select c.password_hash
        from public.magnets_auth_credentials c
        join user_row u on u.id = c.user_id
        limit 1
      ),
      inserted_account as (
        insert into public.magnets_accounts (owner_user_id)
        select id from user_row
        on conflict (owner_user_id) do nothing
        returning id
      ),
      inserted_credential as (
        insert into public.magnets_auth_credentials (user_id, password_hash)
        select id, $3
        from user_row
        where not exists (select 1 from existing_credential)
        on conflict (user_id) do nothing
        returning user_id
      ),
      inserted_session as (
        insert into neon_auth.session (token, "userId", "expiresAt", "updatedAt")
        select $4, user_id, now() + interval '30 days', now()
        from inserted_credential
        returning token
      )
      select
        u.id,
        u.email,
        u.name,
        u.created_at,
        u.updated_at,
        (select password_hash from existing_credential) as existing_password_hash,
        (select token from inserted_session) as session_token,
        (select count(*) from inserted_account) as account_inserted
      from user_row u
    `,
    [normalizedEmail, displayName, passwordHash, storedToken]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    existingPasswordHash: row.existing_password_hash,
    sessionToken: row.session_token ? token : null,
    user: mapUser(row),
  };
}

export async function createPasswordCredential(userId: string, passwordHash: string) {
  await query(
    `
      insert into public.magnets_auth_credentials (user_id, password_hash)
      values ($1, $2)
    `,
    [userId, passwordHash]
  );
}

export async function getPasswordHashForUser(userId: string) {
  const result = await query<CredentialRow>(
    `
      select user_id, password_hash
      from public.magnets_auth_credentials
      where user_id = $1
      limit 1
    `,
    [userId]
  );

  return result.rows[0]?.password_hash || null;
}

export async function createDatabaseSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  const storedToken = sessionTokenHash(token);
  await query(
    `
      insert into neon_auth.session (token, "userId", "expiresAt", "updatedAt")
      values ($1, $2::uuid, now() + interval '30 days', now())
    `,
    [storedToken, userId]
  );

  return token;
}

function sessionTokenHash(token: string) {
  return `sha256:${createHash('sha256').update(token).digest('hex')}`;
}

export async function deleteDatabaseSession(token: string) {
  await query('delete from neon_auth.session where token = any($1::text[])', [
    [token, sessionTokenHash(token)],
  ]);
}

export async function getDashboardPayloadBySessionToken(
  token: string
): Promise<DashboardPayload | null> {
  return getDashboardBaseBySessionToken(token);
}

export async function getDashboardPayload(userId: string): Promise<DashboardPayload | null> {
  return getDashboardBaseByUserId(userId);
}

export async function getAccountWithSecrets(accountId: string) {
  const result = await query<AccountRow>(
    'select * from public.magnets_accounts where id = $1 limit 1',
    [accountId]
  );

  return result.rows[0] ? mapAccount(result.rows[0], { revealSecrets: true }) : null;
}

/**
 * Look up an existing token, or mint a new one if none is set. The token is the
 * value the user pastes into a TXT record on their DNS to prove ownership; we
 * only check matches against `domain_verification_token`, so rotating it
 * silently breaks an in-flight verification (intentional — happens when the
 * domain itself changes).
 */
export async function getOrCreateDomainVerificationToken(accountId: string) {
  const existing = await query<{ domain_verification_token: string }>(
    'select domain_verification_token from public.magnets_accounts where id = $1 limit 1',
    [accountId]
  );
  if (!existing.rows[0]) return null;
  if (existing.rows[0].domain_verification_token) {
    return existing.rows[0].domain_verification_token;
  }

  const token = `magnets-verify-${randomBytes(16).toString('hex')}`;
  await query(
    'update public.magnets_accounts set domain_verification_token = $2 where id = $1',
    [accountId, token]
  );
  return token;
}

export async function markDomainVerified(accountId: string) {
  const result = await query<AccountRow>(
    `
      update public.magnets_accounts
      set domain_verified_at = now()
      where id = $1
      returning *
    `,
    [accountId]
  );
  return result.rows[0] ? mapAccount(result.rows[0]) : null;
}

export async function recordDomainAttached(
  accountId: string,
  host: string,
  recommendedCname: string
) {
  const result = await query<AccountRow>(
    `
      update public.magnets_accounts
      set
        domain_attached_host = $2,
        domain_recommended_cname = $3
      where id = $1
      returning *
    `,
    [accountId, host, recommendedCname]
  );
  return result.rows[0] ? mapAccount(result.rows[0]) : null;
}

export async function clearDomainAttached(accountId: string) {
  await query(
    `
      update public.magnets_accounts
      set domain_attached_host = '', domain_recommended_cname = ''
      where id = $1
    `,
    [accountId]
  );
}

export async function completeOnboarding(
  accountId: string,
  answers: { businessName: string; logoUrl: string; businessType: string; magnetType: string; cadence: string }
) {
  const result = await query<AccountRow>(
    `
      update public.magnets_accounts
      set
        onboarding_completed_at = now(),
        onboarding_business_name = $2,
        onboarding_business_type = $3,
        onboarding_magnet_type = $4,
        onboarding_cadence = $5,
        logo_text = case when logo_text = '' then $2 else logo_text end,
        logo_url = case when logo_url = '' then $6 else logo_url end,
        updated_at = now()
      where id = $1
      returning *
    `,
    [accountId, answers.businessName, answers.businessType, answers.magnetType, answers.cadence, answers.logoUrl]
  );

  return result.rows[0] ? mapAccount(result.rows[0]) : null;
}

export async function updateUserPasswordHash(userId: string, passwordHash: string) {
  await query(
    `
      update public.magnets_auth_credentials
      set password_hash = $2, updated_at = now()
      where user_id = $1
    `,
    [userId, passwordHash]
  );
}

/**
 * Hard-delete the user, their account, magnets, submissions, password row, and
 * Neon Auth session rows. ON DELETE CASCADE on magnets/submissions handles
 * those automatically once the account row is gone.
 */
export async function deleteUserAndAccount(userId: string) {
  await query(
    `
      with deleted_account as (
        delete from public.magnets_accounts
        where owner_user_id = $1::uuid
        returning id
      ),
      deleted_credentials as (
        delete from public.magnets_auth_credentials
        where user_id = $1::uuid
        returning user_id
      ),
      deleted_sessions as (
        delete from neon_auth.session
        where "userId" = $1::uuid
        returning token
      ),
      deleted_user as (
        delete from neon_auth."user"
        where id = $1::uuid
        returning id
      )
      select (select count(*) from deleted_account) as accounts_deleted
    `,
    [userId]
  );
}

export async function updateAccount(
  accountId: string,
  updates: Partial<Omit<AccountSettings, 'id' | 'ownerUserId' | 'createdAt' | 'updatedAt'>>
) {
  const existing = await query<AccountRow>(
    'select * from public.magnets_accounts where id = $1 limit 1',
    [accountId]
  );
  const existingAccount = existing.rows[0];
  if (!existingAccount) return null;

  const beehiivApiKey = isMaskedSecret(updates.beehiivApiKey)
    ? existingAccount.beehiiv_api_key
    : encryptSecret(updates.beehiivApiKey);
  const resendApiKey = isMaskedSecret(updates.resendApiKey)
    ? existingAccount.resend_api_key
    : encryptSecret(updates.resendApiKey);

  // Only the apex domain affects the ownership TXT (which lives at
  // magnets-verify.<apex>). Changing the subdomain does not invalidate the
  // ownership proof — but it does invalidate the attached host (handled at
  // the route layer). Rotating on every subdomain edit would silently break
  // users who already pasted the TXT into their DNS.
  const apexChanged =
    updates.domain !== undefined && updates.domain !== existingAccount.domain;

  // Safety net: if the caller saved a new return-path or domain but didn't
  // re-stitch resendFromEmail, the stored sender will still carry the old
  // suffix. We rewrite it here so the DB never holds an inconsistent
  // local@suffix combination.
  let resendFromEmail = updates.resendFromEmail ?? '';
  const targetReturnPath = updates.resendReturnPath ?? '';
  const targetDomain = updates.domain ?? existingAccount.domain;
  if (resendFromEmail && targetReturnPath && targetDomain) {
    const expectedSuffix = `${targetReturnPath}.${targetDomain}`.toLowerCase();
    const bracket = resendFromEmail.match(/^(.*?)\s*<([^@<>\s]+)@([^<>\s]+)>\s*$/);
    if (bracket) {
      const currentSuffix = bracket[3].toLowerCase();
      if (currentSuffix !== expectedSuffix) {
        const localPart = bracket[2];
        const displayName = bracket[1].trim();
        const address = `${localPart}@${expectedSuffix}`;
        resendFromEmail = displayName ? `${displayName} <${address}>` : address;
      }
    } else {
      const plain = resendFromEmail.match(/^([^@<>\s]+)@([^<>\s]+)$/);
      if (plain && plain[2].toLowerCase() !== expectedSuffix) {
        resendFromEmail = `${plain[1]}@${expectedSuffix}`;
      }
    }
  }

  if (!senderMatchesAccountDomain({
    domain: targetDomain,
    resendFromEmail,
    resendReturnPath: targetReturnPath,
  })) {
    resendFromEmail = '';
  }

  const result = await query<AccountRow>(
    `
      update public.magnets_accounts
      set
        subdomain = $2,
        domain = $3,
        logo_url = $4,
        logo_text = $5,
        brand = $6::jsonb,
        resend_from_email = $7,
        resend_api_key = $8,
        beehiiv_api_key = $9,
        beehiiv_publication_id = $10,
        substack_publication = $11,
        resend_return_path = $13,
        domain_verification_token = case when $12::boolean then '' else domain_verification_token end,
        domain_verified_at = case when $12::boolean then null else domain_verified_at end,
        domain_recommended_cname = case when $12::boolean then '' else domain_recommended_cname end,
        domain_attached_host = case when $12::boolean then '' else domain_attached_host end
      where id = $1
      returning *
    `,
    [
      accountId,
      updates.subdomain,
      updates.domain,
      updates.logoUrl,
      updates.logoText,
      JSON.stringify(updates.brand || defaultBrand),
      resendFromEmail,
      resendApiKey,
      beehiivApiKey,
      updates.beehiivPublicationId,
      updates.substackPublication,
      apexChanged,
      updates.resendReturnPath ?? '',
    ]
  );

  return result.rows[0] ? mapAccount(result.rows[0]) : null;
}

function slugifyTitle(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'resource';
}

async function uniqueLeadMagnetSlug(accountId: string, title: string, runner: QueryRunner = { query }) {
  const baseSlug = slugifyTitle(title);
  const existing = await runner.query<{ slug: string }>(
    `
      select slug
      from public.magnets_lead_magnets
      where account_id = $1
        and (slug = $2 or slug like $3)
    `,
    [accountId, baseSlug, `${baseSlug}-%`]
  );
  const usedSlugs = new Set(existing.rows.map((row) => row.slug));

  if (!usedSlugs.has(baseSlug)) return baseSlug;

  let suffix = 2;
  while (usedSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseSlug}-${suffix}`;
}

export async function createLeadMagnet(
  accountId: string,
  title: string,
  slug: string,
  downloadLink: string
) {
  const cleanTitle = title.trim();
  const cleanLink = downloadLink.trim();
  const desiredSlug = slug.trim().toLowerCase();

  return withTransaction(async (client) => {
    await client.query('select id from public.magnets_accounts where id = $1 for update', [accountId]);

    const countResult = await client.query<{ page_count: number }>(
      'select count(*)::int as page_count from public.magnets_lead_magnets where account_id = $1',
      [accountId]
    );
    const pageCount = countResult.rows[0]?.page_count ?? 0;

    if (pageCount >= MAX_LEAD_MAGNETS_PER_ACCOUNT) {
      throw new LeadMagnetLimitError();
    }

    // If the user-chosen slug collides with another magnet on this account,
    // suffix with -2, -3, etc. Same behaviour as uniqueLeadMagnetSlug but
    // keyed off the explicit slug instead of the title.
    const finalSlug = await uniqueLeadMagnetSlug(accountId, desiredSlug, client);

    // Brand-new magnets ship with empty fields (just the title + slug + URL).
    // Bullets, copy, email body all use placeholder hints in the editor; we
    // intentionally do not pre-fill prose because users were keeping the
    // canned text and shipping it.
    const result = await client.query<LeadMagnetRow>(
      `
        insert into public.magnets_lead_magnets (
          account_id,
          slug,
          title,
          subtitle,
          description,
          bullets,
          bullets_heading,
          cta_text,
          form_heading,
          form_subtext,
          download_link,
          email_subject,
          email_body,
          email_preview,
          published
        )
        values (
          $1,
          $2,
          $3,
          '',
          '',
          '[]'::jsonb,
          '',
          'Send me the resource',
          '',
          '',
          $4,
          '',
          '',
          '',
          false
        )
        returning *
      `,
      [accountId, finalSlug, cleanTitle, cleanLink]
    );

    return mapLeadMagnet(result.rows[0]);
  });
}

export async function updateLeadMagnet(
  accountId: string,
  leadMagnetId: string,
  updates: Partial<Omit<LeadMagnet, 'id' | 'accountId' | 'createdAt' | 'updatedAt'>>
) {
  const result = await query<LeadMagnetRow>(
    `
      update public.magnets_lead_magnets
      set
        slug = $3,
        title = $4,
        subtitle = $5,
        description = $6,
        bullets = $7::jsonb,
        bullets_heading = $8,
        cta_text = $9,
        form_heading = $10,
        form_subtext = $11,
        image_url = $12,
        download_link = $13,
        email_subject = $14,
        email_body = $15,
        email_preview = $16,
        published = $17
      where account_id = $1
        and id = $2
      returning *
    `,
    [
      accountId,
      leadMagnetId,
      updates.slug,
      updates.title,
      updates.subtitle,
      updates.description,
      JSON.stringify(updates.bullets || []),
      updates.bulletsHeading,
      updates.ctaText,
      updates.formHeading,
      updates.formSubtext,
      updates.imageUrl,
      updates.downloadLink,
      updates.emailSubject,
      updates.emailBody,
      updates.emailPreview,
      updates.published,
    ]
  );

  return result.rows[0] ? mapLeadMagnet(result.rows[0]) : null;
}

export async function deleteLeadMagnet(accountId: string, leadMagnetId: string) {
  const result = await query(
    'delete from public.magnets_lead_magnets where account_id = $1 and id = $2',
    [accountId, leadMagnetId]
  );

  return Number(result.rowCount || 0) > 0;
}

export async function findPublishedLeadMagnet(host: string, slug: string) {
  const hostname = host.split(':')[0].toLowerCase();
  const canUseLocalFallback =
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

  // Only resolve to accounts that have actually attached this hostname through
  // the verify-ownership + attach flow. We do NOT match by the user-typed
  // `subdomain || '.' || domain` field, which is unverified user input — that
  // is what previously allowed one account to claim another account's apex.
  // The hostname must equal domain_attached_host exactly.
  const publicLookup = await query<PublicLeadMagnetLookupRow>(
    `
      with account_row as (
        select *
        from public.magnets_accounts
        where lower(domain_attached_host) = $1
          and domain_attached_host <> ''
        limit 1
      ),
      lead_magnet_row as (
        select lm.*
        from public.magnets_lead_magnets lm
        join account_row a on a.id = lm.account_id
        where lm.slug = $2
          and lm.published = true
        limit 1
      )
      select
        row_to_json(a) as account,
        row_to_json(lm) as lead_magnet
      from account_row a
      join lead_magnet_row lm on true
    `,
    [hostname, slug]
  );
  const publicLookupRow = publicLookup.rows[0];

  if (publicLookupRow) {
    return {
      account: mapAccount(publicLookupRow.account),
      leadMagnet: mapLeadMagnet(publicLookupRow.lead_magnet),
    };
  }

  if (canUseLocalFallback) {
    const localLookup = await query<PublicLeadMagnetLookupRow>(
      `
        select
          row_to_json(a) as account,
          row_to_json(lm) as lead_magnet
        from public.magnets_lead_magnets lm
        join public.magnets_accounts a on a.id = lm.account_id
        where lm.slug = $1
          and lm.published = true
        order by lm.updated_at desc
        limit 1
      `,
      [slug]
    );
    const localLookupRow = localLookup.rows[0];

    if (localLookupRow) {
      return {
        account: mapAccount(localLookupRow.account),
        leadMagnet: mapLeadMagnet(localLookupRow.lead_magnet),
      };
    }
  }

  return null;
}

/**
 * Look up an account by the hostname currently attached to its project.
 * Used by the public route to redirect requests for unpublished or missing
 * pages back to the account's apex.
 */
export async function findAccountByAttachedHost(host: string) {
  const hostname = host.split(':')[0].toLowerCase();
  if (!hostname) return null;
  const result = await query<AccountRow>(
    `
      select *
      from public.magnets_accounts
      where lower(domain_attached_host) = $1
        and domain_attached_host <> ''
      limit 1
    `,
    [hostname]
  );
  return result.rows[0] ? mapAccount(result.rows[0]) : null;
}

export async function findPublishedLeadMagnetById(leadMagnetId: string) {
  const lookup = await query<PublicLeadMagnetLookupRow>(
    `
      select
        row_to_json(a) as account,
        row_to_json(lm) as lead_magnet
      from public.magnets_lead_magnets lm
      join public.magnets_accounts a on a.id = lm.account_id
      where lm.id = $1
        and lm.published = true
      limit 1
    `,
    [leadMagnetId]
  );
  const row = lookup.rows[0];
  if (!row) return null;

  return {
    account: mapAccount(row.account),
    leadMagnet: mapLeadMagnet(row.lead_magnet),
  };
}

export async function findLeadMagnet(accountId: string, leadMagnetId: string) {
  const account = await query<AccountRow>(
    'select * from public.magnets_accounts where id = $1 limit 1',
    [accountId]
  );
  const leadMagnet = await query<LeadMagnetRow>(
    'select * from public.magnets_lead_magnets where id = $1 and account_id = $2 limit 1',
    [leadMagnetId, accountId]
  );

  return account.rows[0] && leadMagnet.rows[0]
    ? {
        account: mapAccount(account.rows[0], { revealSecrets: true }),
        leadMagnet: mapLeadMagnet(leadMagnet.rows[0]),
      }
    : null;
}

type SignupRow = {
  email: string;
  name: string;
  first_lead_magnet_title: string;
  first_lead_magnet_slug: string;
  first_signup_at: Date;
  latest_signup_at: Date;
  signup_count: string;
};

function mapSignup(row: SignupRow): AccountSignup {
  return {
    email: row.email,
    name: row.name,
    firstLeadMagnetTitle: row.first_lead_magnet_title,
    firstLeadMagnetSlug: row.first_lead_magnet_slug,
    firstSignupAt: iso(row.first_signup_at),
    latestSignupAt: iso(row.latest_signup_at),
    signupCount: Number(row.signup_count) || 0,
  };
}

export async function listAccountSignups(accountId: string): Promise<AccountSignup[]> {
  const result = await query<SignupRow>(
    `
      with ranked as (
        select
          s.email,
          s.name,
          s.created_at,
          lm.title as lead_magnet_title,
          lm.slug as lead_magnet_slug,
          row_number() over (
            partition by lower(s.email)
            order by s.created_at asc
          ) as first_rank,
          row_number() over (
            partition by lower(s.email)
            order by s.created_at desc
          ) as latest_rank,
          count(*) over (partition by lower(s.email)) as signup_count,
          min(s.created_at) over (partition by lower(s.email)) as first_signup_at,
          max(s.created_at) over (partition by lower(s.email)) as latest_signup_at
        from public.magnets_submissions s
        join public.magnets_lead_magnets lm on lm.id = s.lead_magnet_id
        where s.account_id = $1
      )
      select
        latest.email,
        latest.name,
        first.lead_magnet_title as first_lead_magnet_title,
        first.lead_magnet_slug as first_lead_magnet_slug,
        first.first_signup_at,
        first.latest_signup_at,
        first.signup_count::text as signup_count
      from ranked first
      join ranked latest
        on lower(latest.email) = lower(first.email)
       and latest.latest_rank = 1
      where first.first_rank = 1
      order by first.latest_signup_at desc
    `,
    [accountId]
  );

  return result.rows.map(mapSignup);
}

export async function deleteAccountSignup(accountId: string, email: string) {
  const result = await query<{ deleted: string }>(
    `
      with deleted as (
        delete from public.magnets_submissions
        where account_id = $1::uuid
          and lower(email) = lower($2)
        returning 1
      )
      select count(*)::text as deleted from deleted
    `,
    [accountId, email.trim()]
  );

  return Number(result.rows[0]?.deleted || 0);
}

export async function recordSubmission(submission: Omit<Submission, 'id' | 'createdAt'>) {
  const result = await query<SubmissionRow>(
    `
      insert into public.magnets_submissions (account_id, lead_magnet_id, name, email)
      values ($1, $2, $3, $4)
      returning *
    `,
    [submission.accountId, submission.leadMagnetId, submission.name, submission.email]
  );

  return mapSubmission(result.rows[0]);
}

export async function leadMagnetBelongsToAccount(accountId: string, leadMagnetId: string) {
  const result = await query<{ id: string }>(
    'select id from public.magnets_lead_magnets where id = $1 and account_id = $2 limit 1',
    [leadMagnetId, accountId]
  );
  return result.rows.length > 0;
}

/**
 * Bulk-insert submissions. Rows are sent as a single jsonb_to_recordset insert
 * so the whole batch is one round-trip. The caller is responsible for already
 * having validated each row and resolved the lead_magnet_id.
 */
export async function bulkRecordSubmissions(
  accountId: string,
  rows: Array<{ leadMagnetId: string; name: string; email: string }>
) {
  if (rows.length === 0) return { inserted: 0 };

  const payload = rows.map((row) => ({
    lead_magnet_id: row.leadMagnetId,
    name: row.name.slice(0, 120),
    email: row.email.slice(0, 254),
  }));

  const result = await query<{ count: string }>(
    `
      with input as (
        select
          lead_magnet_id::uuid as lead_magnet_id,
          name,
          email
        from jsonb_to_recordset($2::jsonb) as rows(lead_magnet_id text, name text, email text)
      ),
      inserted as (
        insert into public.magnets_submissions (account_id, lead_magnet_id, name, email)
        select $1::uuid, lead_magnet_id, name, email from input
        returning 1
      )
      select count(*)::text as count from inserted
    `,
    [accountId, JSON.stringify(payload)]
  );

  return { inserted: Number(result.rows[0]?.count || 0) };
}
