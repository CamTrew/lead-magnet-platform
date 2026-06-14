import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { BrandSettings } from '../lib/types';

export const defaultBrand: BrandSettings = {
  primary: '#8b76e8',
  accent: '#d8c8ff',
  success: '#22c55e',
};

const defaultBrandSql = sql`'{"primary":"#8b76e8","accent":"#d8c8ff","success":"#22c55e"}'::jsonb`;

export const accounts = pgTable(
  'magnets_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerUserId: uuid('owner_user_id').notNull(),
    subdomain: text('subdomain').notNull().default('get'),
    domain: text('domain').notNull().default(''),
    logoUrl: text('logo_url').notNull().default(''),
    logoText: text('logo_text').notNull().default(''),
    brand: jsonb('brand').$type<BrandSettings>().notNull().default(defaultBrandSql),
    resendFromEmail: text('resend_from_email').notNull().default(''),
    resendApiKey: text('resend_api_key').notNull().default(''),
    beehiivApiKey: text('beehiiv_api_key').notNull().default(''),
    beehiivPublicationId: text('beehiiv_publication_id').notNull().default(''),
    substackPublication: text('substack_publication').notNull().default(''),
    // Subdomain we tell Resend to put the sending DNS under (MX / SPF / DKIM).
    // Empty until the user enters a sending domain in Configure; we probe their
    // DNS for a clear label and store it so the records stay consistent across
    // reloads. Default chosen at runtime, not in SQL.
    resendReturnPath: text('resend_return_path').notNull().default(''),
    // The TXT-record proof token that customers paste into DNS to prove ownership
    // before we attach the domain to the Vercel project. Rotated when the domain
    // or subdomain changes — invalidates the existing verification.
    domainVerificationToken: text('domain_verification_token').notNull().default(''),
    // When the ownership TXT was last observed. Null = unverified; presence does
    // NOT mean the domain is currently attached to Vercel (see domainAttachedHost).
    domainVerifiedAt: timestamp('domain_verified_at', { withTimezone: true }),
    // The hostname currently attached on the Vercel project. Empty when nothing
    // is attached. We track this so detach/attach diffs are precise even if the
    // domain or subdomain fields are edited mid-way.
    domainAttachedHost: text('domain_attached_host').notNull().default(''),
    // The CNAME target Vercel returned for this domain. Empty until step 3.
    // Hardcoding cname.vercel-dns.com is wrong — Vercel hands out per-project
    // hashed targets like <hash>.vercel-dns-017.com.
    domainRecommendedCname: text('domain_recommended_cname').notNull().default(''),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    onboardingBusinessName: text('onboarding_business_name').notNull().default(''),
    onboardingBusinessType: text('onboarding_business_type').notNull().default(''),
    onboardingMagnetType: text('onboarding_magnet_type').notNull().default(''),
    onboardingCadence: text('onboarding_cadence').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('magnets_accounts_owner_user_id_unique').on(table.ownerUserId),
    index('magnets_accounts_domain_idx').on(table.domain),
    index('magnets_accounts_domain_subdomain_idx').on(table.domain, table.subdomain),
    index('magnets_accounts_updated_at_idx').on(table.updatedAt),
  ]
);

export const authCredentials = pgTable(
  'magnets_auth_credentials',
  {
    userId: uuid('user_id').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId], name: 'magnets_auth_credentials_pkey' }),
  ]
);

export const leadMagnets = pgTable(
  'magnets_lead_magnets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    subtitle: text('subtitle').notNull().default(''),
    description: text('description').notNull().default(''),
    bullets: jsonb('bullets').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    bulletsHeading: text('bullets_heading').notNull().default(''),
    ctaText: text('cta_text').notNull().default('Get the guide'),
    formHeading: text('form_heading').notNull().default(''),
    formSubtext: text('form_subtext').notNull().default(''),
    imageUrl: text('image_url').notNull().default(''),
    downloadLink: text('download_link').notNull().default(''),
    emailSubject: text('email_subject').notNull().default(''),
    emailBody: text('email_body').notNull().default(''),
    emailPreview: text('email_preview').notNull().default(''),
    published: boolean('published').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('magnets_lead_magnets_account_slug_unique').on(table.accountId, table.slug),
    index('magnets_lead_magnets_account_updated_idx').on(table.accountId, table.updatedAt),
    index('magnets_lead_magnets_slug_idx').on(table.slug),
    index('magnets_lead_magnets_published_idx').on(table.published),
  ]
);

export const submissions = pgTable(
  'magnets_submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    leadMagnetId: uuid('lead_magnet_id')
      .notNull()
      .references(() => leadMagnets.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('magnets_submissions_account_created_idx').on(table.accountId, table.createdAt),
    index('magnets_submissions_lead_magnet_created_idx').on(table.leadMagnetId, table.createdAt),
    index('magnets_submissions_email_idx').on(table.email),
    index('magnets_submissions_account_email_idx').on(table.accountId, sql`lower(${table.email})`),
  ]
);

export const rateLimits = pgTable(
  'magnets_rate_limits',
  {
    scope: text('scope').notNull(),
    identifierHash: text('identifier_hash').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow(),
    attempts: integer('attempts').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.scope, table.identifierHash],
      name: 'magnets_rate_limits_pkey',
    }),
    index('magnets_rate_limits_scope_window_idx').on(table.scope, table.windowStart),
    index('magnets_rate_limits_updated_at_idx').on(table.updatedAt),
  ]
);

export const accountsRelations = relations(accounts, ({ many }) => ({
  leadMagnets: many(leadMagnets),
  submissions: many(submissions),
}));

export const leadMagnetsRelations = relations(leadMagnets, ({ one, many }) => ({
  account: one(accounts, {
    fields: [leadMagnets.accountId],
    references: [accounts.id],
  }),
  submissions: many(submissions),
}));

export const submissionsRelations = relations(submissions, ({ one }) => ({
  account: one(accounts, {
    fields: [submissions.accountId],
    references: [accounts.id],
  }),
  leadMagnet: one(leadMagnets, {
    fields: [submissions.leadMagnetId],
    references: [leadMagnets.id],
  }),
}));
