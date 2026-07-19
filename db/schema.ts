import { relations, sql } from 'drizzle-orm';
import {
  bigserial,
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
import type {
  BrandSettings,
  FollowUpEmail,
  PostSignupQuizConfig,
  PostSignupQuizQuestion,
} from '../lib/types';

export const defaultBrand: BrandSettings = {
  primary: '#FE6F34',
  accent: '#FDC957',
  success: '#7FD4DD',
  highlightIntensity: 100,
  pageTheme: 'light',
  privacyPolicyUrl: '',
  termsUrl: '',
};

const defaultBrandSql = sql`'{"primary":"#FE6F34","accent":"#FDC957","success":"#7FD4DD","highlightIntensity":100,"pageTheme":"light"}'::jsonb`;

export const accounts = pgTable(
  'magnets_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerUserId: uuid('owner_user_id').notNull(),
    username: text('username').notNull().default(''),
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
    slackWebhookUrl: text('slack_webhook_url').notNull().default(''),
    pipedriveApiToken: text('pipedrive_api_token').notNull().default(''),
    // Subdomain we tell Resend to put the sending DNS under (MX / SPF / DKIM).
    // Empty until the user enters a sending domain in Configure; we probe their
    // DNS for a clear label and store it so the records stay consistent across
    // reloads. Default chosen at runtime, not in SQL.
    resendReturnPath: text('resend_return_path').notNull().default(''),
    calendarWebhookEnabled: boolean('calendar_webhook_enabled').notNull().default(false),
    calendarWebhookToken: text('calendar_webhook_token').notNull().default(''),
    calendarProvider: text('calendar_provider').notNull().default(''),
    calendarApiKey: text('calendar_api_key').notNull().default(''),
    calendarWebhookSecret: text('calendar_webhook_secret').notNull().default(''),
    calendarWebhookId: text('calendar_webhook_id').notNull().default(''),
    calendarConnectedAt: timestamp('calendar_connected_at', { withTimezone: true }),
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
    uniqueIndex('magnets_accounts_username_unique')
      .on(table.username)
      .where(sql`${table.username} <> ''`),
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

export const passwordResetTokens = pgTable(
  'magnets_password_reset_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('magnets_password_reset_tokens_token_hash_unique').on(table.tokenHash),
    index('magnets_password_reset_tokens_user_created_idx').on(table.userId, table.createdAt),
    index('magnets_password_reset_tokens_expires_at_idx').on(table.expiresAt),
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
    followUpEnabled: boolean('follow_up_enabled').notNull().default(false),
    followUpStopOnBooking: boolean('follow_up_stop_on_booking').notNull().default(true),
    followUpEmails: jsonb('follow_up_emails').$type<FollowUpEmail[]>().notNull().default(sql`'[]'::jsonb`),
    resendFollowUpAutomationId: text('resend_follow_up_automation_id').notNull().default(''),
    resendFollowUpRenderVersion: integer('resend_follow_up_render_version').notNull().default(0),
    postSignupMode: text('post_signup_mode').notNull().default('message'),
    postSignupRedirectUrl: text('post_signup_redirect_url').notNull().default(''),
    postSignupHeading: text('post_signup_heading').notNull().default(''),
    postSignupBody: text('post_signup_body').notNull().default(''),
    postSignupVideoUrl: text('post_signup_video_url').notNull().default(''),
    postSignupCtaLabel: text('post_signup_cta_label').notNull().default(''),
    postSignupCtaUrl: text('post_signup_cta_url').notNull().default(''),
    postSignupQuizEnabled: boolean('post_signup_quiz_enabled').notNull().default(false),
    postSignupQuizTitle: text('post_signup_quiz_title').notNull().default(''),
    postSignupQuizDescription: text('post_signup_quiz_description').notNull().default(''),
    postSignupQuizQuestions: jsonb('post_signup_quiz_questions')
      .$type<PostSignupQuizConfig | PostSignupQuizQuestion[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
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

export const leadMagnetCopilotMessages = pgTable(
  'magnets_lead_magnet_copilot_messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    leadMagnetId: uuid('lead_magnet_id')
      .notNull()
      .references(() => leadMagnets.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    updatedFields: jsonb('updated_fields').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('magnets_copilot_messages_magnet_id_idx').on(table.leadMagnetId, table.id),
  ]
);

export const followUpRuns = pgTable(
  'magnets_follow_up_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    leadMagnetId: uuid('lead_magnet_id')
      .notNull()
      .references(() => leadMagnets.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name').notNull().default(''),
    status: text('status').notNull().default('active'),
    stopReason: text('stop_reason').notNull().default(''),
    sequenceFingerprint: text('sequence_fingerprint').notNull().default(''),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    scheduledEndAt: timestamp('scheduled_end_at', { withTimezone: true }),
    stoppedAt: timestamp('stopped_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('magnets_follow_up_runs_magnet_email_unique').on(table.leadMagnetId, table.email),
    index('magnets_follow_up_runs_account_status_idx').on(table.accountId, table.status),
    index('magnets_follow_up_runs_account_email_idx').on(table.accountId, table.email),
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

export const quizResponses = pgTable(
  'magnets_quiz_responses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    leadMagnetId: uuid('lead_magnet_id')
      .notNull()
      .references(() => leadMagnets.id, { onDelete: 'cascade' }),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submissions.id, { onDelete: 'cascade' }),
    questionId: text('question_id').notNull(),
    question: text('question').notNull().default(''),
    optionId: text('option_id').notNull(),
    optionLabel: text('option_label').notNull().default(''),
    destinationUrl: text('destination_url').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('magnets_quiz_responses_submission_question_unique').on(table.submissionId, table.questionId),
    index('magnets_quiz_responses_account_created_idx').on(table.accountId, table.createdAt),
    index('magnets_quiz_responses_magnet_created_idx').on(table.leadMagnetId, table.createdAt),
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
  quizResponses: many(quizResponses),
  followUpRuns: many(followUpRuns),
}));

export const leadMagnetsRelations = relations(leadMagnets, ({ one, many }) => ({
  account: one(accounts, {
    fields: [leadMagnets.accountId],
    references: [accounts.id],
  }),
  submissions: many(submissions),
  quizResponses: many(quizResponses),
  followUpRuns: many(followUpRuns),
  copilotMessages: many(leadMagnetCopilotMessages),
}));

export const leadMagnetCopilotMessagesRelations = relations(leadMagnetCopilotMessages, ({ one }) => ({
  leadMagnet: one(leadMagnets, {
    fields: [leadMagnetCopilotMessages.leadMagnetId],
    references: [leadMagnets.id],
  }),
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

export const quizResponsesRelations = relations(quizResponses, ({ one }) => ({
  account: one(accounts, {
    fields: [quizResponses.accountId],
    references: [accounts.id],
  }),
  leadMagnet: one(leadMagnets, {
    fields: [quizResponses.leadMagnetId],
    references: [leadMagnets.id],
  }),
  submission: one(submissions, {
    fields: [quizResponses.submissionId],
    references: [submissions.id],
  }),
}));

export const followUpRunsRelations = relations(followUpRuns, ({ one }) => ({
  account: one(accounts, {
    fields: [followUpRuns.accountId],
    references: [accounts.id],
  }),
  leadMagnet: one(leadMagnets, {
    fields: [followUpRuns.leadMagnetId],
    references: [leadMagnets.id],
  }),
}));
