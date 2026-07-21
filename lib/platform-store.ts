import { createHash, randomBytes } from 'node:crypto';
import { query, type QueryRunner, withAdvisoryLock, withTransaction } from './db';
import { normaliseBrandHighlightIntensity } from './brand-highlight';
import { senderMatchesAccountDomain } from './dns-records';
import { platformUsernameStem } from './platform-username';
import { hasPlatformResendApiKey } from './platform-resend';
import { resolveQuizProgress } from './quiz-routing';
import {
  MAX_HOSTED_RESOURCES_PER_ACCOUNT,
  MAX_LEAD_MAGNETS_PER_ACCOUNT,
} from './limits';
import { hostedResourcePublicPath } from './hosted-resources';
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
  CalendarProvider,
  DashboardBasePayload,
  DashboardPayload,
  FollowUpEmail,
  FollowUpStatus,
  HostedResource,
  LeadMagnet,
  LeadMagnetAnalytics,
  LeadMagnetOption,
  LeadMagnetSummary,
  LeadMagnetVersionSnapshot,
  LeadMagnetVersionSource,
  LeadMagnetVersionSummary,
  PlatformUser,
  PostSignupQuizQuestion,
  PostSignupQuizRoute,
  PostSignupMode,
  QuizResponse,
  SignupQuizAnswer,
  Submission,
} from './types';
import type { PersistedLeadMagnetCopilotMessage } from './lead-magnet-copilot';

const defaultBrand: BrandSettings = {
  primary: '#FE6F34',
  accent: '#FDC957',
  success: '#7FD4DD',
  highlightIntensity: 100,
  pageTheme: 'light',
  privacyPolicyUrl: '',
  termsUrl: '',
};

export class LeadMagnetLimitError extends Error {
  constructor() {
    super(`Accounts are limited to ${MAX_LEAD_MAGNETS_PER_ACCOUNT} pages.`);
    this.name = 'LeadMagnetLimitError';
  }
}

export class HostedResourceLimitError extends Error {
  constructor() {
    super(`Accounts are limited to ${MAX_HOSTED_RESOURCES_PER_ACCOUNT} hosted resources.`);
    this.name = 'HostedResourceLimitError';
  }
}

export class AccountDomainMutationInProgressError extends Error {
  constructor() {
    super('Another domain change is already in progress.');
    this.name = 'AccountDomainMutationInProgressError';
  }
}

export class LeadMagnetMutationInProgressError extends Error {
  constructor() {
    super('Another save is already in progress for this page.');
    this.name = 'LeadMagnetMutationInProgressError';
  }
}

export async function withAccountDomainMutationLock<T>(
  accountId: string,
  callback: () => Promise<T>
) {
  const result = await withAdvisoryLock(`magnets:account-domain:${accountId}`, callback);
  if (!result.acquired) throw new AccountDomainMutationInProgressError();
  return result.value;
}

export async function withLeadMagnetMutationLock<T>(
  accountId: string,
  leadMagnetId: string,
  callback: () => Promise<T>
) {
  const result = await withAdvisoryLock(
    `magnets:lead-magnet:${accountId}:${leadMagnetId}`,
    callback
  );
  if (!result.acquired) throw new LeadMagnetMutationInProgressError();
  return result.value;
}

export async function withAccountKitTokenLock<T>(
  accountId: string,
  callback: () => Promise<T>
) {
  const result = await withAdvisoryLock(`magnets:kit-token:${accountId}`, callback);
  if (!result.acquired) throw new Error('Kit connection is already being refreshed.');
  return result.value;
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
  username: string;
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
  kit_access_token: string;
  kit_refresh_token: string;
  kit_token_expires_at: Date | null;
  kit_account_id: string;
  kit_account_name: string;
  slack_webhook_url: string;
  zapier_webhook_url: string;
  pipedrive_api_token: string;
  resend_return_path: string;
  calendar_webhook_enabled: boolean;
  calendar_webhook_token: string;
  calendar_provider: CalendarProvider | string;
  calendar_api_key: string;
  calendar_webhook_secret: string;
  calendar_webhook_id: string;
  calendar_connected_at: Date | null;
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
  follow_up_enabled: boolean;
  follow_up_stop_on_booking: boolean;
  follow_up_emails: FollowUpEmail[] | string | null;
  resend_follow_up_automation_id: string;
  resend_follow_up_render_version: number;
  post_signup_mode: string;
  post_signup_redirect_url: string;
  post_signup_heading: string;
  post_signup_body: string;
  post_signup_video_url: string;
  post_signup_cta_label: string;
  post_signup_cta_url: string;
  post_signup_quiz_enabled: boolean;
  post_signup_quiz_title: string;
  post_signup_quiz_description: string;
  post_signup_quiz_questions: unknown | string | null;
  published: boolean;
  created_at: Date;
  updated_at: Date;
};

type LeadMagnetImageSourceRow = {
  id: string;
  account_id: string;
  image_url: string;
  published: boolean;
  updated_at: Date;
};

type LeadMagnetVersionRow = {
  id: string;
  snapshot: LeadMagnetVersionSnapshot | string;
  source: LeadMagnetVersionSource;
  created_at: Date;
};

type LeadMagnetCopilotMessageRow = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  updated_fields: string[] | string | null;
};

type AccountLogoSourceRow = {
  id: string;
  logo_url: string;
  updated_at: Date;
};

type HostedResourceRow = {
  id: string;
  account_id: string;
  name: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  blob_url: string;
  public_token: string;
  created_at: Date;
  updated_at: Date;
};

type LeadMagnetAnalyticsSummaryRow = {
  total_visits: number;
  total_conversions: number;
  total_video_plays: number;
  total_quiz_completions: number;
  average_engaged_seconds: number;
  recent_visits: number;
  recent_conversions: number;
  recent_video_plays: number;
  recent_quiz_completions: number;
};

type LeadMagnetAnalyticsDayRow = {
  date: string;
  visits: number;
  conversions: number;
};

type SubmissionRow = {
  id: string;
  account_id: string;
  lead_magnet_id: string;
  name: string;
  email: string;
  created_at: Date;
};

type QuizResponseRow = {
  id: string;
  account_id: string;
  lead_magnet_id: string;
  submission_id: string;
  question_id: string;
  question: string;
  option_id: string;
  option_label: string;
  destination_url: string;
  created_at: Date;
};

type FollowUpRunRow = {
  id: string;
  account_id: string;
  lead_magnet_id: string;
  email: string;
  name: string;
  status: FollowUpStatus;
  stop_reason: string;
  sequence_fingerprint: string;
  started_at: Date;
  scheduled_end_at: Date | null;
  stopped_at: Date | null;
  created_at: Date;
  updated_at: Date;
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
  account_username: string;
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
  account_kit_access_token: string;
  account_kit_refresh_token: string;
  account_kit_token_expires_at: Date | null;
  account_kit_account_id: string;
  account_kit_account_name: string;
  account_slack_webhook_url: string;
  account_zapier_webhook_url: string;
  account_pipedrive_api_token: string;
  account_resend_return_path: string;
  account_calendar_webhook_enabled: boolean;
  account_calendar_webhook_token: string;
  account_calendar_provider: CalendarProvider | string;
  account_calendar_api_key: string;
  account_calendar_webhook_secret: string;
  account_calendar_webhook_id: string;
  account_calendar_connected_at: Date | null;
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

type LeadMagnetSummaryRow = {
  id: string;
  account_id: string;
  slug: string;
  title: string;
  subtitle: string;
  image_url: string;
  published: boolean;
  created_at: Date;
  updated_at: Date;
};

type PublicLeadMagnetLookupRow = {
  account: AccountRow;
  lead_magnet: LeadMagnetRow;
};

type PublishedLeadMagnetSitemapRow = {
  id: string;
  slug: string;
  username: string;
  domain_attached_host: string;
  updated_at: Date;
};

export type PublishedLeadMagnetSitemapEntry = {
  id: string;
  slug: string;
  username: string;
  domainAttachedHost: string;
  updatedAt: string;
};

type LeadMagnetJsonRow = {
  lead_magnet: LeadMagnetRow;
};

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapHostedResource(row: HostedResourceRow): HostedResource {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    originalFilename: row.original_filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    publicToken: row.public_token,
    publicUrl: hostedResourcePublicPath(row.public_token),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
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
    pageTheme: parsed.pageTheme === 'dark' ? 'dark' : 'light',
    privacyPolicyUrl: parsed.privacyPolicyUrl || '',
    termsUrl: parsed.termsUrl || '',
  };
}

function normaliseCalendarProvider(value: unknown): CalendarProvider {
  return value === 'calendly' || value === 'calcom' ? value : '';
}

const maxFollowUpDelayMinutes = 30 * 24 * 60;

function normaliseFollowUpDelayMinutes(value: unknown, fallbackHours: unknown) {
  const delayMinutes = Number(value);
  if (Number.isFinite(delayMinutes)) {
    return Math.min(maxFollowUpDelayMinutes, Math.max(0, Math.round(delayMinutes)));
  }

  const delayHours = Number(fallbackHours);
  if (Number.isFinite(delayHours)) {
    return Math.min(maxFollowUpDelayMinutes, Math.max(0, Math.round(delayHours * 60)));
  }

  return 24 * 60;
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

function parseFollowUpEmails(value: LeadMagnetRow['follow_up_emails']): FollowUpEmail[] {
  if (!value) return [];
  let raw: unknown = value;

  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(raw)) return [];

  return raw
    .slice(0, 10)
    .map((item, index) => {
      const source = typeof item === 'object' && item !== null ? item as Record<string, unknown> : {};
      const id = typeof source.id === 'string' && source.id.trim()
        ? source.id.trim().slice(0, 80)
        : `email-${index + 1}`;
      const delayMinutes = normaliseFollowUpDelayMinutes(source.delayMinutes, source.delayHours);
      return {
        id,
        delayMinutes,
        delayHours: Math.round(delayMinutes / 60),
        subject: typeof source.subject === 'string' ? source.subject.slice(0, 180) : '',
        preview: typeof source.preview === 'string' ? source.preview.slice(0, 240) : '',
        body: typeof source.body === 'string' ? source.body.slice(0, 10000) : '',
        resendTemplateId: typeof source.resendTemplateId === 'string'
          ? source.resendTemplateId.slice(0, 200)
          : '',
      };
    });
}

function parsePostSignupQuizConfig(
  value: LeadMagnetRow['post_signup_quiz_questions']
): { questions: PostSignupQuizQuestion[]; routes: PostSignupQuizRoute[] } {
  if (!value) return { questions: [], routes: [] };

  let raw: unknown = value;
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value);
    } catch {
      return { questions: [], routes: [] };
    }
  }

  const questionSource = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).questions)
      ? (raw as Record<string, unknown>).questions as unknown[]
      : [];

  const questions = questionSource.slice(0, 5).flatMap((item, questionIndex) => {
    if (!item || typeof item !== 'object') return [];
    const source = item as Record<string, unknown>;
    const options = Array.isArray(source.options) ? source.options : [];
    const normalisedOptions = options.slice(0, 6).flatMap((option, optionIndex) => {
      if (!option || typeof option !== 'object') return [];
      const sourceOption = option as Record<string, unknown>;
      const label = typeof sourceOption.label === 'string' ? sourceOption.label.trim().slice(0, 160) : '';
      if (!label) return [];
      return [{
        id: typeof sourceOption.id === 'string' && sourceOption.id.trim()
          ? sourceOption.id.trim().slice(0, 80)
          : `option-${questionIndex + 1}-${optionIndex + 1}`,
        label,
        destinationUrl: typeof sourceOption.destinationUrl === 'string'
          ? sourceOption.destinationUrl.trim().slice(0, 2048)
          : '',
      }];
    });
    const prompt = typeof source.prompt === 'string' ? source.prompt.trim().slice(0, 240) : '';
    if (!prompt || normalisedOptions.length < 2) return [];
    return [{
      id: typeof source.id === 'string' && source.id.trim()
        ? source.id.trim().slice(0, 80)
        : `question-${questionIndex + 1}`,
      prompt,
      options: normalisedOptions,
    }];
  });

  const questionIds = new Set(questions.map((question) => question.id));
  const optionIds = new Map(questions.map((question) => [
    question.id,
    new Set(question.options.map((option) => option.id)),
  ]));
  const routeSource = raw && typeof raw === 'object' && !Array.isArray(raw)
    && Array.isArray((raw as Record<string, unknown>).routes)
    ? (raw as Record<string, unknown>).routes as unknown[]
    : [];
  const routes = routeSource.slice(0, 20).flatMap((item, routeIndex) => {
    if (!item || typeof item !== 'object') return [];
    const source = item as Record<string, unknown>;
    const rawConditions = Array.isArray(source.conditions) ? source.conditions : [];
    const conditions = rawConditions.slice(0, 5).flatMap((condition) => {
      if (!condition || typeof condition !== 'object') return [];
      const sourceCondition = condition as Record<string, unknown>;
      const questionId = typeof sourceCondition.questionId === 'string' ? sourceCondition.questionId.trim().slice(0, 80) : '';
      const optionId = typeof sourceCondition.optionId === 'string' ? sourceCondition.optionId.trim().slice(0, 80) : '';
      if (!questionIds.has(questionId) || !optionIds.get(questionId)?.has(optionId)) return [];
      return [{ questionId, optionId }];
    });
    return [{
      id: typeof source.id === 'string' && source.id.trim()
        ? source.id.trim().slice(0, 80)
        : `route-${routeIndex + 1}`,
      destinationUrl: typeof source.destinationUrl === 'string'
        ? source.destinationUrl.trim().slice(0, 2048)
        : '',
      conditions,
    }];
  });

  return { questions, routes };
}

function isBlobStorageUrl(value: string) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

function isPrivateBlobStorageUrl(value: string) {
  if (!isBlobStorageUrl(value)) return false;

  try {
    return new URL(value).hostname.endsWith('.private.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

function leadMagnetImageProxyUrl(row: Pick<LeadMagnetRow, 'id' | 'image_url' | 'updated_at'>) {
  // Public Blob uploads are already immutable CDN URLs. Routing them through
  // our server adds a database read and a second Blob fetch before pixels can
  // reach the browser, which makes the hero image visibly arrive late. Keep
  // the proxy solely for private uploads, where it enforces access control.
  if (!row.image_url.startsWith('data:') && !isPrivateBlobStorageUrl(row.image_url)) {
    return row.image_url;
  }
  return `/magnet-images/${row.id}?v=${encodeURIComponent(iso(row.updated_at))}`;
}

function accountLogoProxyUrl(row: Pick<AccountRow, 'id' | 'logo_url' | 'updated_at'>) {
  if (!row.logo_url.startsWith('data:') && !isPrivateBlobStorageUrl(row.logo_url)) {
    return row.logo_url;
  }
  return `/brand-logos/${row.id}?v=${encodeURIComponent(iso(row.updated_at))}`;
}

function mapLeadMagnetSummary(row: LeadMagnetSummaryRow): LeadMagnetSummary {
  return {
    id: row.id,
    accountId: row.account_id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    imageUrl: leadMagnetImageProxyUrl(row),
    published: row.published,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
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

function mapAccount(
  row: AccountRow,
  options: { revealSecrets?: boolean } = {}
): AccountSettings {
  const revealedResendApiKey = options.revealSecrets
    ? decryptSecret(row.resend_api_key)
    : '';
  const hasOwnResendApiKey = options.revealSecrets
    ? Boolean(revealedResendApiKey)
    : Boolean(row.resend_api_key);
  const hasVerifiedOwnSender = Boolean(
    row.resend_from_email &&
      row.domain_verified_at &&
      senderMatchesAccountDomain({
        domain: row.domain,
        resendFromEmail: row.resend_from_email,
        resendReturnPath: row.resend_return_path,
      })
  );
  const usesOwnResendWorkspace = hasOwnResendApiKey && hasVerifiedOwnSender;
  // The managed workspace can verify and send from a customer's custom
  // domain. The absence of a customer-owned key is therefore the authority
  // for whether this account is managed by Magnets; domain verification alone
  // must not flip the account into an unusable customer-workspace state.
  const resendManagedByPlatform = hasPlatformResendApiKey() && !hasOwnResendApiKey;

  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    username: row.username || '',
    subdomain: row.subdomain,
    domain: row.domain,
    logoUrl: accountLogoProxyUrl(row),
    logoText: row.logo_text,
    brand: parseBrand(row.brand),
    resendFromEmail: row.resend_from_email,
    resendApiKey: options.revealSecrets
      ? revealedResendApiKey
      : redactSecret(row.resend_api_key),
    resendConfigured: usesOwnResendWorkspace || resendManagedByPlatform,
    resendManagedByPlatform,
    beehiivApiKey: options.revealSecrets
      ? decryptSecret(row.beehiiv_api_key)
      : redactSecret(row.beehiiv_api_key),
    beehiivPublicationId: row.beehiiv_publication_id,
    substackPublication: row.substack_publication,
    kitAccessToken: options.revealSecrets ? decryptSecret(row.kit_access_token) : '',
    kitRefreshToken: options.revealSecrets ? decryptSecret(row.kit_refresh_token) : '',
    kitTokenExpiresAt: row.kit_token_expires_at ? iso(row.kit_token_expires_at) : null,
    kitAccountId: row.kit_account_id,
    kitAccountName: row.kit_account_name,
    kitConnected: Boolean(row.kit_refresh_token && row.kit_account_id),
    slackWebhookUrl: options.revealSecrets
      ? decryptSecret(row.slack_webhook_url)
      : redactSecret(row.slack_webhook_url),
    zapierWebhookUrl: options.revealSecrets
      ? decryptSecret(row.zapier_webhook_url)
      : redactSecret(row.zapier_webhook_url),
    pipedriveApiToken: options.revealSecrets
      ? decryptSecret(row.pipedrive_api_token)
      : redactSecret(row.pipedrive_api_token),
    resendReturnPath: row.resend_return_path,
    calendarWebhookEnabled: row.calendar_webhook_enabled,
    // The webhook token is a server-only credential. It is only needed by
    // webhook handlers, never by the initial dashboard payload.
    calendarWebhookToken: options.revealSecrets
      ? decryptSecret(row.calendar_webhook_token)
      : '',
    calendarProvider: normaliseCalendarProvider(row.calendar_provider),
    calendarApiKey: options.revealSecrets
      ? decryptSecret(row.calendar_api_key)
      : redactSecret(row.calendar_api_key),
    calendarWebhookSecret: options.revealSecrets
      ? decryptSecret(row.calendar_webhook_secret)
      : redactSecret(row.calendar_webhook_secret),
    calendarWebhookId: row.calendar_webhook_id || '',
    calendarConnectedAt: row.calendar_connected_at ? iso(row.calendar_connected_at) : null,
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
  const postSignupQuiz = parsePostSignupQuizConfig(row.post_signup_quiz_questions);
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
    imageUrl: leadMagnetImageProxyUrl(row),
    downloadLink: row.download_link,
    emailSubject: row.email_subject,
    emailBody: row.email_body,
    emailPreview: row.email_preview,
    followUpEnabled: row.follow_up_enabled,
    followUpStopOnBooking: row.follow_up_enabled && row.follow_up_stop_on_booking,
    followUpEmails: parseFollowUpEmails(row.follow_up_emails),
    resendFollowUpAutomationId: row.resend_follow_up_automation_id,
    resendFollowUpRenderVersion: Number(row.resend_follow_up_render_version || 0),
    postSignupMode: row.post_signup_mode === 'redirect' || row.post_signup_mode === 'page'
      ? row.post_signup_mode as PostSignupMode
      : 'message',
    postSignupRedirectUrl: row.post_signup_redirect_url || '',
    postSignupHeading: row.post_signup_heading || '',
    postSignupBody: row.post_signup_body || '',
    postSignupVideoUrl: row.post_signup_video_url || '',
    postSignupCtaLabel: row.post_signup_cta_label || '',
    postSignupCtaUrl: row.post_signup_cta_url || '',
    postSignupQuizEnabled: row.post_signup_mode === 'page' && Boolean(row.post_signup_quiz_enabled),
    postSignupQuizTitle: row.post_signup_quiz_title || '',
    postSignupQuizDescription: row.post_signup_quiz_description || '',
    postSignupQuizQuestions: postSignupQuiz.questions,
    postSignupQuizRoutes: postSignupQuiz.routes,
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

function mapQuizResponse(row: QuizResponseRow): QuizResponse {
  return {
    id: row.id,
    accountId: row.account_id,
    leadMagnetId: row.lead_magnet_id,
    submissionId: row.submission_id,
    questionId: row.question_id,
    question: row.question,
    optionId: row.option_id,
    optionLabel: row.option_label,
    destinationUrl: row.destination_url,
    createdAt: iso(row.created_at),
  };
}

function mapDashboardBase(row: DashboardBaseRow): DashboardBasePayload {
  return {
    user: mapUser({
      id: row.user_id,
      email: row.user_email,
      name: row.user_name,
      created_at: row.user_created_at,
      updated_at: row.user_updated_at,
    }),
    account: mapAccount(
      {
        id: row.account_id,
        owner_user_id: row.account_owner_user_id,
        username: row.account_username,
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
        kit_access_token: row.account_kit_access_token,
        kit_refresh_token: row.account_kit_refresh_token,
        kit_token_expires_at: row.account_kit_token_expires_at,
        kit_account_id: row.account_kit_account_id,
        kit_account_name: row.account_kit_account_name,
        slack_webhook_url: row.account_slack_webhook_url,
        zapier_webhook_url: row.account_zapier_webhook_url,
        pipedrive_api_token: row.account_pipedrive_api_token,
        resend_return_path: row.account_resend_return_path,
        calendar_webhook_enabled: row.account_calendar_webhook_enabled,
        calendar_webhook_token: row.account_calendar_webhook_token,
        calendar_provider: row.account_calendar_provider,
        calendar_api_key: row.account_calendar_api_key,
        calendar_webhook_secret: row.account_calendar_webhook_secret,
        calendar_webhook_id: row.account_calendar_webhook_id,
        calendar_connected_at: row.account_calendar_connected_at,
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
      },
      {}
    ),
  };
}

async function getDashboardBaseByUserId(userId: string) {
  const result = await query<DashboardBaseRow>(
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
        select u.id
        from user_row u
        where not exists (
          select 1
          from public.magnets_accounts existing
          where existing.owner_user_id = u.id
        )
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
        a.username as account_username,
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
        coalesce(to_jsonb(a)->>'kit_access_token', '') as account_kit_access_token,
        coalesce(to_jsonb(a)->>'kit_refresh_token', '') as account_kit_refresh_token,
        nullif(to_jsonb(a)->>'kit_token_expires_at', '')::timestamptz as account_kit_token_expires_at,
        coalesce(to_jsonb(a)->>'kit_account_id', '') as account_kit_account_id,
        coalesce(to_jsonb(a)->>'kit_account_name', '') as account_kit_account_name,
        a.slack_webhook_url as account_slack_webhook_url,
        coalesce(to_jsonb(a)->>'zapier_webhook_url', '') as account_zapier_webhook_url,
        a.pipedrive_api_token as account_pipedrive_api_token,
        a.resend_return_path as account_resend_return_path,
        a.calendar_webhook_enabled as account_calendar_webhook_enabled,
        a.calendar_webhook_token as account_calendar_webhook_token,
        coalesce(to_jsonb(a)->>'calendar_provider', '') as account_calendar_provider,
        coalesce(to_jsonb(a)->>'calendar_api_key', '') as account_calendar_api_key,
        coalesce(to_jsonb(a)->>'calendar_webhook_secret', '') as account_calendar_webhook_secret,
        coalesce(to_jsonb(a)->>'calendar_webhook_id', '') as account_calendar_webhook_id,
        nullif(to_jsonb(a)->>'calendar_connected_at', '')::timestamptz as account_calendar_connected_at,
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
        a.updated_at as account_updated_at
      from user_row u
      join account_row a on true
    `,
    [userId]
  );

  return result.rows[0] ? mapDashboardBase(result.rows[0]) : null;
}

async function getDashboardBaseBySessionToken(token: string) {
  const result = await query<DashboardBaseRow>(
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
        select u.id
        from user_row u
        where not exists (
          select 1
          from public.magnets_accounts existing
          where existing.owner_user_id = u.id
        )
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
        a.username as account_username,
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
        coalesce(to_jsonb(a)->>'kit_access_token', '') as account_kit_access_token,
        coalesce(to_jsonb(a)->>'kit_refresh_token', '') as account_kit_refresh_token,
        nullif(to_jsonb(a)->>'kit_token_expires_at', '')::timestamptz as account_kit_token_expires_at,
        coalesce(to_jsonb(a)->>'kit_account_id', '') as account_kit_account_id,
        coalesce(to_jsonb(a)->>'kit_account_name', '') as account_kit_account_name,
        a.slack_webhook_url as account_slack_webhook_url,
        coalesce(to_jsonb(a)->>'zapier_webhook_url', '') as account_zapier_webhook_url,
        a.pipedrive_api_token as account_pipedrive_api_token,
        a.resend_return_path as account_resend_return_path,
        a.calendar_webhook_enabled as account_calendar_webhook_enabled,
        a.calendar_webhook_token as account_calendar_webhook_token,
        coalesce(to_jsonb(a)->>'calendar_provider', '') as account_calendar_provider,
        coalesce(to_jsonb(a)->>'calendar_api_key', '') as account_calendar_api_key,
        coalesce(to_jsonb(a)->>'calendar_webhook_secret', '') as account_calendar_webhook_secret,
        coalesce(to_jsonb(a)->>'calendar_webhook_id', '') as account_calendar_webhook_id,
        nullif(to_jsonb(a)->>'calendar_connected_at', '')::timestamptz as account_calendar_connected_at,
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
        a.updated_at as account_updated_at
      from user_row u
      join account_row a on true
    `,
    [[token, sessionTokenHash(token)]]
  );

  return result.rows[0] ? mapDashboardBase(result.rows[0]) : null;
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
  const base = await getDashboardBaseBySessionToken(token);
  if (!base) return null;

  return {
    ...base,
    leadMagnets: await listLeadMagnetsForAccount(base.account.id),
  };
}

export async function getDashboardPayload(userId: string): Promise<DashboardPayload | null> {
  const base = await getDashboardBaseByUserId(userId);
  if (!base) return null;

  return {
    ...base,
    leadMagnets: await listLeadMagnetsForAccount(base.account.id),
  };
}

export async function getDashboardBasePayloadBySessionToken(
  token: string
): Promise<DashboardBasePayload | null> {
  return getDashboardBaseBySessionToken(token);
}

export async function getDashboardBasePayload(
  userId: string
): Promise<DashboardBasePayload | null> {
  return getDashboardBaseByUserId(userId);
}

export async function getAccountWithSecrets(accountId: string) {
  const result = await query<AccountRow>(
    'select * from public.magnets_accounts where id = $1 limit 1',
    [accountId]
  );

  return result.rows[0] ? mapAccount(result.rows[0], { revealSecrets: true }) : null;
}

export async function saveKitConnection(input: {
  accountId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  kitAccountId: string;
  kitAccountName: string;
}) {
  const result = await query<AccountRow>(
    `
      update public.magnets_accounts
      set
        kit_access_token = $2,
        kit_refresh_token = $3,
        kit_token_expires_at = $4,
        kit_account_id = $5,
        kit_account_name = $6,
        updated_at = now()
      where id = $1
      returning *
    `,
    [
      input.accountId,
      encryptSecret(input.accessToken),
      encryptSecret(input.refreshToken),
      input.tokenExpiresAt,
      input.kitAccountId,
      input.kitAccountName.slice(0, 200),
    ]
  );
  return result.rows[0] ? mapAccount(result.rows[0]) : null;
}

export async function updateKitConnectionTokens(input: {
  accountId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
}) {
  const result = await query<{ id: string }>(
    `
      update public.magnets_accounts
      set
        kit_access_token = $2,
        kit_refresh_token = $3,
        kit_token_expires_at = $4,
        updated_at = now()
      where id = $1
        and kit_account_id <> ''
      returning id
    `,
    [
      input.accountId,
      encryptSecret(input.accessToken),
      encryptSecret(input.refreshToken),
      input.tokenExpiresAt,
    ]
  );
  return Boolean(result.rows[0]);
}

export async function disconnectKitAccount(accountId: string) {
  const result = await query<AccountRow>(
    `
      update public.magnets_accounts
      set
        kit_access_token = '',
        kit_refresh_token = '',
        kit_token_expires_at = null,
        kit_account_id = '',
        kit_account_name = '',
        updated_at = now()
      where id = $1
      returning *
    `,
    [accountId]
  );
  return result.rows[0] ? mapAccount(result.rows[0]) : null;
}

/**
 * Finds persisted follow-up automations that need a one-off provider sync.
 * The caller must fetch each account separately with secrets before calling
 * Resend, so encrypted API keys never travel with this result.
 */
export async function listEnabledFollowUpAutomationTargets() {
  const result = await query<LeadMagnetRow>(
    `
      select m.*
      from public.magnets_lead_magnets m
      where m.follow_up_enabled = true
      order by m.account_id, m.created_at
    `
  );

  return result.rows.map(mapLeadMagnet);
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
  answers: { businessName: string; businessType: string; magnetType: string; cadence: string }
) {
  const stem = platformUsernameStem(answers.businessName);
  const accountSuffix = accountId.replace(/-/g, '').slice(0, 6);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt === 1 ? accountSuffix : `${accountSuffix}-${attempt}`}`;
    const username = `${stem.slice(0, Math.max(3, 40 - suffix.length))}${suffix}`;

    try {
      const result = await query<AccountRow>(
        `
          update public.magnets_accounts
          set
            username = case when username = '' then $6 else username end,
            onboarding_completed_at = now(),
            onboarding_business_name = $2,
            onboarding_business_type = $3,
            onboarding_magnet_type = $4,
            onboarding_cadence = $5,
            logo_text = case when logo_text = '' then $2 else logo_text end,
            updated_at = now()
          where id = $1
            and (
              username <> ''
              or not exists (
                select 1
                from public.magnets_accounts existing
                where lower(existing.username) = lower($6)
                  and existing.id <> $1
              )
            )
          returning *
        `,
        [accountId, answers.businessName, answers.businessType, answers.magnetType, answers.cadence, username]
      );

      if (result.rows[0]) return mapAccount(result.rows[0]);
    } catch (error) {
      const isUsernameCollision =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505';
      if (!isUsernameCollision) throw error;
    }
  }

  throw new Error('Could not reserve a Magnets URL. Please try onboarding again.');
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
 * Replace any still-active reset link for the user with a fresh one. Only the
 * SHA-256 digest is stored, so a database read cannot be used as a reset link.
 */
export async function createPasswordResetToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date
) {
  await query(
    `
      with invalidated_tokens as (
        update public.magnets_password_reset_tokens
        set used_at = now()
        where user_id = $1::uuid
          and used_at is null
      )
      insert into public.magnets_password_reset_tokens (
        user_id,
        token_hash,
        expires_at
      )
      values ($1::uuid, $2, $3)
    `,
    [userId, tokenHash, expiresAt]
  );
}

/**
 * Consumes a reset token and updates the password in the same statement. This
 * makes the link single-use even if two requests reach the server together.
 */
export async function resetPasswordFromToken(tokenHash: string, passwordHash: string) {
  const result = await query<{ user_id: string }>(
    `
      with consumed_token as (
        update public.magnets_password_reset_tokens
        set used_at = now()
        where token_hash = $1
          and used_at is null
          and expires_at > now()
        returning user_id
      ),
      updated_credentials as (
        insert into public.magnets_auth_credentials (user_id, password_hash)
        select user_id, $2
        from consumed_token
        on conflict (user_id) do update
          set password_hash = excluded.password_hash,
              updated_at = now()
        returning user_id
      ),
      revoked_sessions as (
        delete from neon_auth.session
        where "userId" = (select user_id from consumed_token)
      )
      select user_id
      from updated_credentials
    `,
    [tokenHash, passwordHash]
  );

  return result.rows[0]?.user_id || null;
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
      deleted_password_reset_tokens as (
        delete from public.magnets_password_reset_tokens
        where user_id = $1::uuid
        returning id
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

  // AI/MAINTAINER CONTEXT: dashboard account payloads contain masked secrets.
  // A mask means “leave encrypted bytes untouched”; an explicit empty string
  // means disconnect. Preserve optional fields when an older rolling-deploy
  // client omits them entirely.
  const beehiivApiKey = isMaskedSecret(updates.beehiivApiKey)
    ? existingAccount.beehiiv_api_key
    : encryptSecret(updates.beehiivApiKey);
  const resendApiKey = isMaskedSecret(updates.resendApiKey)
    ? existingAccount.resend_api_key
    : encryptSecret(updates.resendApiKey);
  const slackWebhookUrl = isMaskedSecret(updates.slackWebhookUrl)
    ? existingAccount.slack_webhook_url
    : encryptSecret(updates.slackWebhookUrl);
  // Optional during rolling deployments so an older open dashboard tab cannot
  // erase a Zapier connection saved by the newer UI.
  const zapierWebhookUrl =
    updates.zapierWebhookUrl === undefined || isMaskedSecret(updates.zapierWebhookUrl)
      ? existingAccount.zapier_webhook_url
      : encryptSecret(updates.zapierWebhookUrl);
  const pipedriveApiToken = isMaskedSecret(updates.pipedriveApiToken)
    ? existingAccount.pipedrive_api_token
    : encryptSecret(updates.pipedriveApiToken);
  const wantsCalendarWebhooks = Boolean(updates.calendarWebhookEnabled);
  const calendarWebhookToken =
    wantsCalendarWebhooks && !existingAccount.calendar_webhook_token
      ? encryptSecret(randomBytes(24).toString('hex'))
      : existingAccount.calendar_webhook_token;

  // Only the apex domain affects the ownership TXT (which lives at
  // magnets-verify.<apex>). Changing the subdomain does not invalidate the
  // ownership proof — but it does invalidate the attached host (handled at
  // the route layer). Rotating on every subdomain edit would silently break
  // users who already pasted the TXT into their DNS.
  const apexChanged =
    updates.domain !== undefined && updates.domain !== existingAccount.domain;
  const targetDomain = updates.domain ?? existingAccount.domain;
  const domainVerificationToken = targetDomain
    ? apexChanged || !existingAccount.domain_verification_token
      ? `magnets-verify-${randomBytes(16).toString('hex')}`
      : existingAccount.domain_verification_token
    : '';

  // Safety net: if the caller saved a new return-path or domain but didn't
  // re-stitch resendFromEmail, the stored sender will still carry the old
  // suffix. We rewrite it here so the DB never holds an inconsistent
  // local@suffix combination.
  let resendFromEmail = updates.resendFromEmail ?? '';
  const targetReturnPath = updates.resendReturnPath ?? '';
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
        username = $2,
        subdomain = $3,
        domain = $4,
        logo_url = case
          when $5 = ('/brand-logos/' || id::text)
            or $5 like ('/brand-logos/' || id::text || '?%')
            then logo_url
          else $5
        end,
        logo_text = $6,
        brand = $7::jsonb,
        resend_from_email = $8,
        resend_api_key = $9,
        beehiiv_api_key = $10,
        beehiiv_publication_id = $11,
        substack_publication = $12,
        slack_webhook_url = $18,
        pipedrive_api_token = $19,
        zapier_webhook_url = $20,
        resend_return_path = $14,
        calendar_webhook_enabled = $15,
        calendar_webhook_token = $16,
        domain_verification_token = $17,
        domain_verified_at = case when $13::boolean then null else domain_verified_at end,
        domain_recommended_cname = case when $13::boolean then '' else domain_recommended_cname end,
        domain_attached_host = case when $13::boolean then '' else domain_attached_host end,
        updated_at = now()
      where id = $1
      returning *
    `,
    [
      accountId,
      updates.username ?? existingAccount.username,
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
      wantsCalendarWebhooks,
      calendarWebhookToken,
      domainVerificationToken,
      slackWebhookUrl,
      pipedriveApiToken,
      zapierWebhookUrl,
    ]
  );

  return result.rows[0] ? mapAccount(result.rows[0]) : null;
}

export async function getOrCreateCalendarWebhookToken(accountId: string) {
  const existing = await query<{ calendar_webhook_token: string }>(
    'select calendar_webhook_token from public.magnets_accounts where id = $1 limit 1',
    [accountId]
  );
  const row = existing.rows[0];
  if (!row) return null;

  const currentToken = decryptSecret(row.calendar_webhook_token);
  if (currentToken) return currentToken;

  const token = randomBytes(24).toString('hex');
  await query(
    'update public.magnets_accounts set calendar_webhook_token = $2, updated_at = now() where id = $1',
    [accountId, encryptSecret(token)]
  );
  return token;
}

export async function updateCalendarIntegration(
  accountId: string,
  updates: {
    enabled: boolean;
    provider: CalendarProvider;
    apiKey?: string;
    webhookSecret?: string;
    webhookId?: string;
    connectedAt?: Date | null;
  }
) {
  const existing = await query<AccountRow>(
    'select * from public.magnets_accounts where id = $1 limit 1',
    [accountId]
  );
  const existingAccount = existing.rows[0];
  if (!existingAccount) return null;

  if (!updates.enabled) {
    const result = await query<AccountRow>(
      `
        update public.magnets_accounts
        set
          calendar_webhook_enabled = false,
          calendar_provider = '',
          calendar_api_key = '',
          calendar_webhook_secret = '',
          calendar_webhook_id = '',
          calendar_connected_at = null,
          updated_at = now()
        where id = $1
        returning *
      `,
      [accountId]
    );
    return result.rows[0] ? mapAccount(result.rows[0]) : null;
  }

  const provider = normaliseCalendarProvider(updates.provider);
  const apiKey = isMaskedSecret(updates.apiKey)
    ? existingAccount.calendar_api_key
    : encryptSecret(updates.apiKey);
  const webhookSecret = isMaskedSecret(updates.webhookSecret)
    ? existingAccount.calendar_webhook_secret
    : encryptSecret(updates.webhookSecret);
  const calendarWebhookToken = existingAccount.calendar_webhook_token
    ? existingAccount.calendar_webhook_token
    : encryptSecret(randomBytes(24).toString('hex'));

  const result = await query<AccountRow>(
    `
      update public.magnets_accounts
      set
        calendar_webhook_enabled = true,
        calendar_webhook_token = $2,
        calendar_provider = $3,
        calendar_api_key = $4,
        calendar_webhook_secret = $5,
        calendar_webhook_id = $6,
        calendar_connected_at = $7,
        updated_at = now()
      where id = $1
      returning *
    `,
    [
      accountId,
      calendarWebhookToken,
      provider,
      apiKey,
      webhookSecret,
      updates.webhookId || '',
      updates.connectedAt || null,
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
  downloadLink = '',
  generatedDraft?: Pick<
    LeadMagnet,
    | 'subtitle'
    | 'description'
    | 'bullets'
    | 'bulletsHeading'
    | 'ctaText'
    | 'formHeading'
    | 'formSubtext'
    | 'emailSubject'
    | 'emailBody'
    | 'emailPreview'
  >
) {
  const cleanTitle = title.trim();
  const cleanLink = downloadLink.trim();
  const desiredSlug = slug.trim().toLowerCase();
  const draft = generatedDraft && {
    subtitle: generatedDraft.subtitle.trim(),
    description: generatedDraft.description.trim(),
    bullets: generatedDraft.bullets.map((bullet) => bullet.trim()).filter(Boolean),
    bulletsHeading: generatedDraft.bulletsHeading.trim(),
    ctaText: generatedDraft.ctaText.trim(),
    formHeading: generatedDraft.formHeading.trim(),
    formSubtext: generatedDraft.formSubtext.trim(),
    emailSubject: generatedDraft.emailSubject.trim(),
    emailBody: generatedDraft.emailBody.trim(),
    emailPreview: generatedDraft.emailPreview.trim(),
  };

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
          follow_up_enabled,
          follow_up_stop_on_booking,
          follow_up_emails,
          resend_follow_up_automation_id,
          published
        )
        values (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6::jsonb,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          false,
          false,
          '[]'::jsonb,
          '',
          false
        )
        returning *
      `,
      [
        accountId,
        finalSlug,
        cleanTitle,
        draft?.subtitle || '',
        draft?.description || '',
        JSON.stringify(draft?.bullets || []),
        draft?.bulletsHeading || '',
        draft?.ctaText || 'Send it to me',
        draft?.formHeading || '',
        draft?.formSubtext || '',
        cleanLink,
        draft?.emailSubject || '',
        draft?.emailBody || '',
        draft?.emailPreview || '',
      ]
    );

    return mapLeadMagnet(result.rows[0]);
  });
}

function leadMagnetVersionSnapshot(leadMagnet: LeadMagnet): LeadMagnetVersionSnapshot {
  const editable = { ...leadMagnet } as Record<string, unknown>;
  delete editable.id;
  delete editable.accountId;
  delete editable.createdAt;
  delete editable.updatedAt;
  delete editable.resendFollowUpAutomationId;
  delete editable.resendFollowUpRenderVersion;
  const snapshot = editable as LeadMagnetVersionSnapshot;

  return {
    ...snapshot,
    // Proxy cache-busters change on every write even when the underlying image
    // does not. Removing it keeps version fingerprints content-based.
    imageUrl: snapshot.imageUrl.replace(/^(\/magnet-images\/[0-9a-f-]{36})\?.*$/i, '$1'),
    followUpEmails: snapshot.followUpEmails.map((email) => ({
      ...email,
      // Provider template IDs are never valid restore targets.
      resendTemplateId: '',
    })),
  };
}

function versionFingerprint(snapshot: LeadMagnetVersionSnapshot) {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

async function storeLeadMagnetVersion(
  runner: QueryRunner,
  accountId: string,
  leadMagnetId: string,
  leadMagnet: LeadMagnet,
  source: LeadMagnetVersionSource
) {
  const snapshot = leadMagnetVersionSnapshot(leadMagnet);
  const fingerprint = versionFingerprint(snapshot);

  // Skip only a consecutive identical snapshot. If a user restores an older
  // state after later edits it becomes a new, visible recovery point.
  await runner.query(
    `
      insert into public.magnets_lead_magnet_versions (
        lead_magnet_id,
        account_id,
        snapshot,
        fingerprint,
        source
      )
      select $1, $2, $3::jsonb, $4, $5
      where not exists (
        select 1
        from public.magnets_lead_magnet_versions
        where lead_magnet_id = $1
        order by created_at desc, id desc
        limit 1
      )
      or $4 <> (
        select fingerprint
        from public.magnets_lead_magnet_versions
        where lead_magnet_id = $1
        order by created_at desc, id desc
        limit 1
      )
    `,
    [leadMagnetId, accountId, JSON.stringify(snapshot), fingerprint, source]
  );

  await runner.query(
    `
      delete from public.magnets_lead_magnet_versions
      where lead_magnet_id = $1
        and id not in (
          select id
          from public.magnets_lead_magnet_versions
          where lead_magnet_id = $1
          order by created_at desc, id desc
          limit 100
        )
    `,
    [leadMagnetId]
  );
}

async function updateLeadMagnetWithRunner(
  runner: QueryRunner,
  accountId: string,
  leadMagnetId: string,
  updates: Partial<Omit<LeadMagnet, 'id' | 'accountId' | 'createdAt' | 'updatedAt'>>
) {
  const result = await runner.query<LeadMagnetRow>(
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
        image_url = case
          when $12 = ('/magnet-images/' || id::text)
            or $12 like ('/magnet-images/' || id::text || '?%')
            then image_url
          else $12
        end,
        download_link = $13,
        email_subject = $14,
        email_body = $15,
        email_preview = $16,
        follow_up_enabled = $17,
        follow_up_stop_on_booking = $18,
        follow_up_emails = $19::jsonb,
        resend_follow_up_automation_id = $20,
        post_signup_mode = $21,
        post_signup_redirect_url = $22,
        post_signup_heading = $23,
        post_signup_body = $24,
        post_signup_video_url = $25,
        post_signup_cta_label = $26,
        post_signup_cta_url = $27,
        post_signup_quiz_enabled = $28,
        post_signup_quiz_title = $29,
        post_signup_quiz_description = $30,
        post_signup_quiz_questions = $31::jsonb,
        published = $32,
        updated_at = now()
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
      updates.followUpEnabled,
      updates.followUpStopOnBooking,
      JSON.stringify(updates.followUpEmails || []),
      updates.resendFollowUpAutomationId,
      updates.postSignupMode,
      updates.postSignupRedirectUrl,
      updates.postSignupHeading,
      updates.postSignupBody,
      updates.postSignupVideoUrl,
      updates.postSignupCtaLabel,
      updates.postSignupCtaUrl,
      updates.postSignupQuizEnabled,
      updates.postSignupQuizTitle,
      updates.postSignupQuizDescription,
      JSON.stringify({
        questions: updates.postSignupQuizQuestions || [],
        routes: updates.postSignupQuizRoutes || [],
      }),
      updates.published,
    ]
  );

  return result.rows[0] ? mapLeadMagnet(result.rows[0]) : null;
}

export async function updateLeadMagnet(
  accountId: string,
  leadMagnetId: string,
  updates: Partial<Omit<LeadMagnet, 'id' | 'accountId' | 'createdAt' | 'updatedAt'>>,
  options: { versionSource?: LeadMagnetVersionSource } = {}
) {
  if (!options.versionSource) {
    return updateLeadMagnetWithRunner({ query }, accountId, leadMagnetId, updates);
  }
  const versionSource = options.versionSource;

  return withTransaction(async (client) => {
    const previousResult = await client.query<LeadMagnetRow>(
      `
        select *
        from public.magnets_lead_magnets
        where account_id = $1
          and id = $2
        for update
      `,
      [accountId, leadMagnetId]
    );
    const previousRow = previousResult.rows[0];
    if (!previousRow) return null;

    const existingVersion = await client.query<{ exists: boolean }>(
      `select exists(
        select 1
        from public.magnets_lead_magnet_versions
        where lead_magnet_id = $1
      ) as exists`,
      [leadMagnetId]
    );
    if (!existingVersion.rows[0]?.exists) {
      await storeLeadMagnetVersion(
        client,
        accountId,
        leadMagnetId,
        mapLeadMagnet(previousRow),
        'baseline'
      );
    }

    const updated = await updateLeadMagnetWithRunner(client, accountId, leadMagnetId, updates);
    if (updated) {
      await storeLeadMagnetVersion(
        client,
        accountId,
        leadMagnetId,
        updated,
        versionSource
      );
    }
    return updated;
  });
}

export async function listLeadMagnetVersions(
  accountId: string,
  leadMagnetId: string,
  limit = 50
): Promise<LeadMagnetVersionSummary[]> {
  const result = await query<LeadMagnetVersionRow>(
    `
      select v.id::text, v.snapshot, v.source, v.created_at
      from public.magnets_lead_magnet_versions v
      inner join public.magnets_lead_magnets m on m.id = v.lead_magnet_id
      where v.account_id = $1
        and v.lead_magnet_id = $2
        and m.account_id = $1
      order by v.created_at desc, v.id desc
      limit $3
    `,
    [accountId, leadMagnetId, Math.max(1, Math.min(limit, 100))]
  );

  return result.rows.map((row) => {
    const snapshot = typeof row.snapshot === 'string'
      ? JSON.parse(row.snapshot) as LeadMagnetVersionSnapshot
      : row.snapshot;
    return {
      id: row.id,
      source: row.source,
      createdAt: iso(row.created_at),
      title: snapshot.title,
      emailSubject: snapshot.emailSubject,
    };
  });
}

export async function getLeadMagnetVersion(
  accountId: string,
  leadMagnetId: string,
  versionId: string
): Promise<LeadMagnetVersionSnapshot | null> {
  const result = await query<Pick<LeadMagnetVersionRow, 'snapshot'>>(
    `
      select v.snapshot
      from public.magnets_lead_magnet_versions v
      inner join public.magnets_lead_magnets m on m.id = v.lead_magnet_id
      where v.account_id = $1
        and v.lead_magnet_id = $2
        and v.id = $3::bigint
        and m.account_id = $1
      limit 1
    `,
    [accountId, leadMagnetId, versionId]
  );
  const snapshot = result.rows[0]?.snapshot;
  if (!snapshot) return null;
  return typeof snapshot === 'string'
    ? JSON.parse(snapshot) as LeadMagnetVersionSnapshot
    : snapshot;
}

export async function updateLeadMagnetImageUrl(
  accountId: string,
  leadMagnetId: string,
  imageUrl: string
) {
  const result = await query<LeadMagnetRow>(
    `
      update public.magnets_lead_magnets
      set image_url = $3,
          updated_at = now()
      where account_id = $1
        and id = $2
      returning *
    `,
    [accountId, leadMagnetId, imageUrl]
  );

  return result.rows[0] ? mapLeadMagnet(result.rows[0]) : null;
}

export async function updateLeadMagnetFollowUpSync(
  accountId: string,
  leadMagnetId: string,
  updates: {
    followUpEmails: FollowUpEmail[];
    resendFollowUpAutomationId: string;
    resendFollowUpRenderVersion: number;
  }
) {
  const result = await query<LeadMagnetRow>(
    `
      update public.magnets_lead_magnets
      set
        follow_up_emails = $3::jsonb,
        resend_follow_up_automation_id = $4,
        resend_follow_up_render_version = $5,
        updated_at = now()
      where account_id = $1
        and id = $2
      returning *
    `,
    [
      accountId,
      leadMagnetId,
      JSON.stringify(updates.followUpEmails),
      updates.resendFollowUpAutomationId,
      updates.resendFollowUpRenderVersion,
    ]
  );

  return result.rows[0] ? mapLeadMagnet(result.rows[0]) : null;
}

export async function getLeadMagnetImageSource(leadMagnetId: string) {
  const result = await query<LeadMagnetImageSourceRow>(
    `
      select
        id,
        account_id,
        image_url,
        published,
        updated_at
      from public.magnets_lead_magnets
      where id = $1
      limit 1
    `,
    [leadMagnetId]
  );

  const row = result.rows[0];
  if (!row || !row.image_url) return null;

  return {
    id: row.id,
    accountId: row.account_id,
    imageUrl: row.image_url,
    published: row.published,
    updatedAt: iso(row.updated_at),
  };
}

export async function getAccountLogoSource(accountId: string) {
  const result = await query<AccountLogoSourceRow>(
    `
      select id, logo_url, updated_at
      from public.magnets_accounts
      where id = $1
      limit 1
    `,
    [accountId]
  );

  const row = result.rows[0];
  if (!row?.logo_url) return null;

  return {
    id: row.id,
    logoUrl: row.logo_url,
    updatedAt: iso(row.updated_at),
  };
}

export async function listLeadMagnetImageSources() {
  const result = await query<LeadMagnetImageSourceRow>(
    `
      select
        id,
        account_id,
        image_url,
        published,
        updated_at
      from public.magnets_lead_magnets
      where image_url <> ''
      order by updated_at asc
    `
  );

  return result.rows.map((row) => ({
      id: row.id,
      accountId: row.account_id,
      imageUrl: row.image_url,
      published: row.published,
      updatedAt: iso(row.updated_at),
    }));
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

  // Local development does not have an attached customer hostname. Skip the
  // guaranteed miss against domain_attached_host and resolve the latest page
  // directly, saving one remote Neon round trip on every public page load.
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

    return localLookupRow
      ? {
          account: mapAccount(localLookupRow.account),
          leadMagnet: mapLeadMagnet(localLookupRow.lead_magnet),
        }
      : null;
  }

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

export async function findPublishedLeadMagnetByUsername(username: string, slug: string) {
  const lookup = await query<PublicLeadMagnetLookupRow>(
    `
      select
        row_to_json(a) as account,
        row_to_json(lm) as lead_magnet
      from public.magnets_accounts a
      join public.magnets_lead_magnets lm on lm.account_id = a.id
      where lower(a.username) = $1
        and a.username <> ''
        and lm.slug = $2
        and lm.published = true
      limit 1
    `,
    [username, slug]
  );
  const row = lookup.rows[0];
  if (!row) return null;

  return {
    account: mapAccount(row.account),
    leadMagnet: mapLeadMagnet(row.lead_magnet),
  };
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

/**
 * Minimal public index data for sitemap generation. Deliberately excludes page
 * copy, email content, secrets, and image data so sitemap requests stay cheap.
 */
export async function listPublishedLeadMagnetsForSitemap(
  attachedHost = ''
): Promise<PublishedLeadMagnetSitemapEntry[]> {
  const hostname = attachedHost.split(':')[0].trim().toLowerCase();
  const result = await query<PublishedLeadMagnetSitemapRow>(
    `
      select
        lm.id,
        lm.slug,
        a.username,
        a.domain_attached_host,
        lm.updated_at
      from public.magnets_lead_magnets lm
      join public.magnets_accounts a on a.id = lm.account_id
      where lm.published = true
        and ($1 = '' or lower(a.domain_attached_host) = $1)
      order by lm.updated_at desc
      limit 49900
    `,
    [hostname]
  );

  return result.rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    username: row.username || '',
    domainAttachedHost: row.domain_attached_host || '',
    updatedAt: iso(row.updated_at),
  }));
}

export async function listLeadMagnetsForAccount(accountId: string): Promise<LeadMagnet[]> {
  const result = await query<LeadMagnetRow>(
    `
      select *
      from public.magnets_lead_magnets
      where account_id = $1
      order by updated_at desc
    `,
    [accountId]
  );

  return result.rows.map(mapLeadMagnet);
}

export async function listLeadMagnetSummaries(
  accountId: string
): Promise<LeadMagnetSummary[]> {
  const result = await query<LeadMagnetSummaryRow>(
    `
      select
        id,
        account_id,
        slug,
        title,
        subtitle,
        case
          when image_url = '' then ''
          when image_url like 'data:%'
            or image_url like 'https://%.private.blob.vercel-storage.com/%'
            then '/magnet-images/' || id::text || '?v=' || extract(epoch from updated_at)::bigint::text
          else image_url
        end as image_url,
        published,
        created_at,
        updated_at
      from public.magnets_lead_magnets
      where account_id = $1
      order by updated_at desc
    `,
    [accountId]
  );

  return result.rows.map(mapLeadMagnetSummary);
}

export async function listLeadMagnetOptions(
  accountId: string
): Promise<LeadMagnetOption[]> {
  const result = await query<{ id: string; title: string; slug: string }>(
    `
      select id, title, slug
      from public.magnets_lead_magnets
      where account_id = $1
      order by updated_at desc
    `,
    [accountId]
  );

  return result.rows.map((row) => ({ id: row.id, title: row.title, slug: row.slug }));
}

export async function listHostedResources(accountId: string): Promise<HostedResource[]> {
  // Account scoping belongs in SQL, not as an in-memory filter after reading
  // every customer's resource metadata.
  const result = await query<HostedResourceRow>(
    `
      select
        id,
        account_id,
        name,
        original_filename,
        content_type,
        size_bytes,
        blob_url,
        public_token,
        created_at,
        updated_at
      from public.magnets_hosted_resources
      where account_id = $1
      order by created_at desc, id desc
    `,
    [accountId]
  );
  return result.rows.map(mapHostedResource);
}

export async function createHostedResource(input: {
  id: string;
  accountId: string;
  name: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  blobUrl: string;
}): Promise<HostedResource> {
  // Serialize the count+insert per account so concurrent uploads cannot both
  // observe one remaining slot and exceed the plan limit.
  const lock = await withAdvisoryLock(`magnets:hosted-resources:${input.accountId}`, async () => {
    const countResult = await query<{ resource_count: number }>(
      `select count(*)::int as resource_count from public.magnets_hosted_resources where account_id = $1`,
      [input.accountId]
    );
    if ((countResult.rows[0]?.resource_count || 0) >= MAX_HOSTED_RESOURCES_PER_ACCOUNT) {
      throw new HostedResourceLimitError();
    }

    const result = await query<HostedResourceRow>(
      `
        insert into public.magnets_hosted_resources (
          id,
          account_id,
          name,
          original_filename,
          content_type,
          size_bytes,
          blob_url,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, now())
        returning
          id,
          account_id,
          name,
          original_filename,
          content_type,
          size_bytes,
          blob_url,
          public_token,
          created_at,
          updated_at
      `,
      [
        input.id,
        input.accountId,
        input.name,
        input.originalFilename,
        input.contentType,
        input.sizeBytes,
        input.blobUrl,
      ]
    );
    return mapHostedResource(result.rows[0]);
  });

  if (!lock.acquired) throw new Error('Another hosted resource upload is already being saved.');
  return lock.value;
}

export async function getHostedResourceSourceByToken(publicToken: string) {
  // This is the only intentionally public lookup. The unguessable token is a
  // capability URL; callers must never accept accountId/blobUrl from the visitor.
  const result = await query<HostedResourceRow>(
    `
      select
        id,
        account_id,
        name,
        original_filename,
        content_type,
        size_bytes,
        blob_url,
        public_token,
        created_at,
        updated_at
      from public.magnets_hosted_resources
      where public_token = $1
      limit 1
    `,
    [publicToken]
  );
  const row = result.rows[0];
  return row ? { ...mapHostedResource(row), blobUrl: row.blob_url } : null;
}

export async function deleteHostedResource(accountId: string, resourceId: string) {
  const result = await query<HostedResourceRow>(
    `
      delete from public.magnets_hosted_resources
      where account_id = $1 and id = $2
      returning
        id,
        account_id,
        name,
        original_filename,
        content_type,
        size_bytes,
        blob_url,
        public_token,
        created_at,
        updated_at
    `,
    [accountId, resourceId]
  );
  const row = result.rows[0];
  return row ? { ...mapHostedResource(row), blobUrl: row.blob_url } : null;
}

/**
 * Record one anonymous browser session per magnet. Reloads in the same tab
 * update the existing row, while engaged time only ever moves forwards.
 */
export async function recordLeadMagnetVisit(input: {
  leadMagnetId: string;
  sessionId: string;
  engagedSeconds: number;
}) {
  const result = await query<{ id: number }>(
    `
      insert into public.magnets_lead_magnet_visits as existing_visit (
        account_id,
        lead_magnet_id,
        session_id,
        engaged_seconds,
        last_seen_at
      )
      select
        lead_magnet.account_id,
        lead_magnet.id,
        $2::uuid,
        least(greatest($3::int, 0), 21600),
        now()
      from public.magnets_lead_magnets lead_magnet
      where lead_magnet.id = $1::uuid
        and lead_magnet.published = true
      on conflict (lead_magnet_id, session_id)
      do update set
        engaged_seconds = greatest(
          existing_visit.engaged_seconds,
          excluded.engaged_seconds
        ),
        last_seen_at = now()
      returning id
    `,
    [input.leadMagnetId, input.sessionId, input.engagedSeconds]
  );
  return Boolean(result.rows[0]);
}

/** Mark only successful public form submissions as analytics conversions. */
export async function markLeadMagnetVisitConverted(input: {
  accountId: string;
  leadMagnetId: string;
  sessionId: string;
}) {
  const result = await query<{ id: number }>(
    `
      insert into public.magnets_lead_magnet_visits as existing_visit (
        account_id,
        lead_magnet_id,
        session_id,
        converted_at,
        last_seen_at
      )
      select
        lead_magnet.account_id,
        lead_magnet.id,
        $3::uuid,
        now(),
        now()
      from public.magnets_lead_magnets lead_magnet
      where lead_magnet.id = $2::uuid
        and lead_magnet.account_id = $1::uuid
      on conflict (lead_magnet_id, session_id)
      do update set
        converted_at = coalesce(
          existing_visit.converted_at,
          excluded.converted_at
        ),
        last_seen_at = now()
      returning id
    `,
    [input.accountId, input.leadMagnetId, input.sessionId]
  );
  return Boolean(result.rows[0]);
}

/**
 * Count one explicit post-signup video start per successful submission. The
 * submission UUID is the public capability, while the magnet/configuration
 * checks prevent arbitrary analytics events from being accepted.
 */
export async function recordPostSignupVideoPlay(input: {
  leadMagnetId: string;
  submissionId: string;
}) {
  const result = await query<{ id: string }>(
    `
      update public.magnets_submissions submission
      set post_signup_video_played_at = coalesce(
        submission.post_signup_video_played_at,
        now()
      )
      from public.magnets_lead_magnets lead_magnet
      where submission.id = $1::uuid
        and submission.lead_magnet_id = $2::uuid
        and lead_magnet.id = submission.lead_magnet_id
        and lead_magnet.published = true
        and lead_magnet.post_signup_mode = 'page'
        and nullif(trim(lead_magnet.post_signup_video_url), '') is not null
      returning submission.id
    `,
    [input.submissionId, input.leadMagnetId]
  );
  return Boolean(result.rows[0]);
}

export async function getLeadMagnetAnalytics(
  accountId: string,
  leadMagnetId: string
): Promise<LeadMagnetAnalytics> {
  const [summaryResult, dailyResult] = await Promise.all([
    query<LeadMagnetAnalyticsSummaryRow>(
      `
        select
          count(*)::int as total_visits,
          count(*) filter (where converted_at is not null)::int as total_conversions,
          coalesce(avg(engaged_seconds), 0)::float8 as average_engaged_seconds,
          count(*) filter (
            where first_seen_at >= date_trunc('day', now()) - interval '29 days'
          )::int as recent_visits,
          count(*) filter (
            where converted_at >= date_trunc('day', now()) - interval '29 days'
          )::int as recent_conversions,
          coalesce(outcomes.total_video_plays, 0)::int as total_video_plays,
          coalesce(outcomes.total_quiz_completions, 0)::int as total_quiz_completions,
          coalesce(outcomes.recent_video_plays, 0)::int as recent_video_plays,
          coalesce(outcomes.recent_quiz_completions, 0)::int as recent_quiz_completions
        from public.magnets_lead_magnet_visits
        cross join lateral (
          select
            count(*) filter (where post_signup_video_played_at is not null)::int as total_video_plays,
            count(*) filter (where post_signup_quiz_completed_at is not null)::int as total_quiz_completions,
            count(*) filter (
              where post_signup_video_played_at >= date_trunc('day', now()) - interval '29 days'
            )::int as recent_video_plays,
            count(*) filter (
              where post_signup_quiz_completed_at >= date_trunc('day', now()) - interval '29 days'
            )::int as recent_quiz_completions
          from public.magnets_submissions
          where account_id = $1::uuid
            and lead_magnet_id = $2::uuid
        ) outcomes
        where account_id = $1::uuid
          and lead_magnet_id = $2::uuid
        group by
          outcomes.total_video_plays,
          outcomes.total_quiz_completions,
          outcomes.recent_video_plays,
          outcomes.recent_quiz_completions
      `,
      [accountId, leadMagnetId]
    ),
    query<LeadMagnetAnalyticsDayRow>(
      `
        with days as (
          select generate_series(
            date_trunc('day', now()) - interval '29 days',
            date_trunc('day', now()),
            interval '1 day'
          ) as day
        )
        select
          to_char(days.day, 'YYYY-MM-DD') as date,
          count(visit.id) filter (
            where visit.first_seen_at >= days.day
              and visit.first_seen_at < days.day + interval '1 day'
          )::int as visits,
          count(visit.id) filter (
            where visit.converted_at >= days.day
              and visit.converted_at < days.day + interval '1 day'
          )::int as conversions
        from days
        left join public.magnets_lead_magnet_visits visit
          on visit.account_id = $1::uuid
          and visit.lead_magnet_id = $2::uuid
          and (
            visit.first_seen_at >= date_trunc('day', now()) - interval '29 days'
            or visit.converted_at >= date_trunc('day', now()) - interval '29 days'
          )
        group by days.day
        order by days.day
      `,
      [accountId, leadMagnetId]
    ),
  ]);

  const summary = summaryResult.rows[0] || {
    total_visits: 0,
    total_conversions: 0,
    total_video_plays: 0,
    total_quiz_completions: 0,
    average_engaged_seconds: 0,
    recent_visits: 0,
    recent_conversions: 0,
    recent_video_plays: 0,
    recent_quiz_completions: 0,
  };
  const totalVisits = Number(summary.total_visits || 0);
  const totalConversions = Number(summary.total_conversions || 0);

  return {
    totalVisits,
    totalConversions,
    totalVideoPlays: Number(summary.total_video_plays || 0),
    totalQuizCompletions: Number(summary.total_quiz_completions || 0),
    conversionRate: totalVisits > 0 ? (totalConversions / totalVisits) * 100 : 0,
    averageEngagedSeconds: Math.round(Number(summary.average_engaged_seconds || 0)),
    recentVisits: Number(summary.recent_visits || 0),
    recentConversions: Number(summary.recent_conversions || 0),
    recentVideoPlays: Number(summary.recent_video_plays || 0),
    recentQuizCompletions: Number(summary.recent_quiz_completions || 0),
    daily: dailyResult.rows.map((row) => ({
      date: row.date,
      visits: Number(row.visits || 0),
      conversions: Number(row.conversions || 0),
    })),
  };
}

export async function findLatestPublishedLeadMagnetForAccount(accountId: string) {
  const result = await query<LeadMagnetRow>(
    `
      select *
      from public.magnets_lead_magnets
      where account_id = $1
        and published = true
      order by updated_at desc
      limit 1
    `,
    [accountId]
  );

  return result.rows[0] ? mapLeadMagnet(result.rows[0]) : null;
}

export async function findLeadMagnetForAccount(accountId: string, leadMagnetId: string) {
  const result = await query<LeadMagnetRow>(
    'select * from public.magnets_lead_magnets where id = $1 and account_id = $2 limit 1',
    [leadMagnetId, accountId]
  );

  return result.rows[0] ? mapLeadMagnet(result.rows[0]) : null;
}

function parseCopilotUpdatedFields(value: LeadMagnetCopilotMessageRow['updated_fields']) {
  if (Array.isArray(value)) return value.filter((field): field is string => typeof field === 'string');
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((field): field is string => typeof field === 'string')
      : [];
  } catch {
    return [];
  }
}

export async function listLeadMagnetCopilotMessages(
  accountId: string,
  leadMagnetId: string,
  limit = 100
): Promise<PersistedLeadMagnetCopilotMessage[]> {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 200));
  const result = await query<LeadMagnetCopilotMessageRow>(
    `
      select recent.id, recent.role, recent.content, recent.updated_fields
      from (
        select
          message.id::text as id,
          message.role,
          message.content,
          message.updated_fields
        from public.magnets_lead_magnet_copilot_messages message
        join public.magnets_lead_magnets magnet on magnet.id = message.lead_magnet_id
        where magnet.account_id = $1
          and magnet.id = $2
        order by message.id desc
        limit $3
      ) recent
      order by recent.id::bigint asc
    `,
    [accountId, leadMagnetId, safeLimit]
  );

  return result.rows.flatMap((row) => {
    if (row.role !== 'user' && row.role !== 'assistant') return [];
    return [{
      id: row.id,
      role: row.role,
      content: row.content,
      updatedFields: parseCopilotUpdatedFields(row.updated_fields),
    }];
  });
}

export async function listLeadMagnetCopilotMemoryMessages(
  accountId: string,
  leadMagnetId: string,
  recentLimit = 196
): Promise<PersistedLeadMagnetCopilotMessage[]> {
  const safeRecentLimit = Math.max(1, Math.min(Math.floor(recentLimit), 196));
  const result = await query<LeadMagnetCopilotMessageRow>(
    `
      with owned_messages as (
        select
          message.id,
          message.role,
          message.content,
          message.updated_fields
        from public.magnets_lead_magnet_copilot_messages message
        join public.magnets_lead_magnets magnet on magnet.id = message.lead_magnet_id
        where magnet.account_id = $1
          and magnet.id = $2
      ),
      selected as (
        (select * from owned_messages order by id asc limit 4)
        union
        (select * from owned_messages order by id desc limit $3)
      )
      select id::text, role, content, updated_fields
      from selected
      order by id asc
    `,
    [accountId, leadMagnetId, safeRecentLimit]
  );

  return result.rows.flatMap((row) => {
    if (row.role !== 'user' && row.role !== 'assistant') return [];
    return [{
      id: row.id,
      role: row.role,
      content: row.content,
      updatedFields: parseCopilotUpdatedFields(row.updated_fields),
    }];
  });
}

export async function appendLeadMagnetCopilotExchange({
  accountId,
  leadMagnetId,
  userContent,
  assistantContent,
  updatedFields,
}: {
  accountId: string;
  leadMagnetId: string;
  userContent: string;
  assistantContent: string;
  updatedFields: string[];
}) {
  // Lock the owned magnet and append both sides in one transaction so memory
  // never contains a user turn without its matching assistant response (or
  // vice versa). The ownership query is also the authorization check.
  return withTransaction(async (client) => {
    const owned = await client.query(
      'select id from public.magnets_lead_magnets where account_id = $1 and id = $2 for update',
      [accountId, leadMagnetId]
    );
    if (!owned.rowCount) return false;

    await client.query(
      `
        insert into public.magnets_lead_magnet_copilot_messages
          (lead_magnet_id, role, content, updated_fields)
        values
          ($1, 'user', $2, '[]'::jsonb),
          ($1, 'assistant', $3, $4::jsonb)
      `,
      [leadMagnetId, userContent, assistantContent, JSON.stringify(updatedFields)]
    );

    return true;
  });
}

export async function clearLeadMagnetCopilotMessages(accountId: string, leadMagnetId: string) {
  // Delete through the owned magnet join; a raw message id is never sufficient
  // authorization to reset another account's conversation.
  const result = await query(
    `
      delete from public.magnets_lead_magnet_copilot_messages message
      using public.magnets_lead_magnets magnet
      where message.lead_magnet_id = magnet.id
        and magnet.account_id = $1
        and magnet.id = $2
    `,
    [accountId, leadMagnetId]
  );

  return Number(result.rowCount || 0);
}

export async function accountOwnsLeadMagnet(accountId: string, leadMagnetId: string) {
  const result = await query<{ exists: boolean }>(
    `
      select exists(
        select 1
        from public.magnets_lead_magnets
        where account_id = $1
          and id = $2
      ) as exists
    `,
    [accountId, leadMagnetId]
  );

  return Boolean(result.rows[0]?.exists);
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
  lead_magnets: Array<{ id: string; title: string; slug: string }> | string | null;
  first_lead_magnet_id: string;
  first_lead_magnet_title: string;
  first_lead_magnet_slug: string;
  first_signup_at: Date;
  latest_signup_at: Date;
  signup_count: string;
  follow_up_status: FollowUpStatus;
  follow_up_stopped_at: Date | null;
  follow_up_stop_reason: string;
  quiz_answers: SignupQuizAnswer[] | string | null;
};

function mapSignup(row: SignupRow): AccountSignup {
  const leadMagnets = (() => {
    const value = (() => {
      if (Array.isArray(row.lead_magnets)) return row.lead_magnets;
      if (typeof row.lead_magnets !== 'string') return [];
      try {
        const parsed = JSON.parse(row.lead_magnets) as unknown;
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })();

    return value.filter(
      (magnet): magnet is { id: string; title: string; slug: string } =>
        typeof magnet === 'object' &&
        magnet !== null &&
        typeof magnet.id === 'string' &&
        typeof magnet.title === 'string' &&
        typeof magnet.slug === 'string'
    );
  })();

  const quizAnswers = (() => {
    if (Array.isArray(row.quiz_answers)) return row.quiz_answers;
    if (typeof row.quiz_answers !== 'string') return [];
    try {
      const parsed = JSON.parse(row.quiz_answers) as unknown;
      return Array.isArray(parsed) ? (parsed as SignupQuizAnswer[]) : [];
    } catch {
      return [];
    }
  })();

  return {
    email: row.email,
    name: row.name,
    leadMagnets,
    firstLeadMagnetId: row.first_lead_magnet_id,
    firstLeadMagnetTitle: row.first_lead_magnet_title,
    firstLeadMagnetSlug: row.first_lead_magnet_slug,
    firstSignupAt: iso(row.first_signup_at),
    latestSignupAt: iso(row.latest_signup_at),
    signupCount: Number(row.signup_count) || 0,
    followUpStatus: row.follow_up_status,
    followUpStoppedAt: row.follow_up_stopped_at ? iso(row.follow_up_stopped_at) : null,
    followUpStopReason: row.follow_up_stop_reason,
    quizAnswers,
  };
}

export async function listAccountSignups(
  accountId: string,
  options: { leadMagnetId?: string } = {}
): Promise<AccountSignup[]> {
  const result = await query<SignupRow>(
    `
      with ranked as (
        select
          s.email,
          s.name,
          s.created_at,
          lm.id as lead_magnet_id,
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
          and ($2::uuid is null or s.lead_magnet_id = $2::uuid)
      )
      select
        latest.email,
        latest.name,
        (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', magnet_signup.id,
                'title', magnet_signup.title,
                'slug', magnet_signup.slug
              ) order by magnet_signup.first_signup_at asc
            ),
            '[]'::jsonb
          )
          from (
            select
              associated_magnet.id,
              associated_magnet.title,
              associated_magnet.slug,
              min(associated_submission.created_at) as first_signup_at
            from public.magnets_submissions associated_submission
            join public.magnets_lead_magnets associated_magnet
              on associated_magnet.id = associated_submission.lead_magnet_id
            where associated_submission.account_id = $1::uuid
              and lower(associated_submission.email) = lower(first.email)
              and ($2::uuid is null or associated_submission.lead_magnet_id = $2::uuid)
            group by associated_magnet.id, associated_magnet.title, associated_magnet.slug
          ) magnet_signup
        ) as lead_magnets,
        first.lead_magnet_id as first_lead_magnet_id,
        first.lead_magnet_title as first_lead_magnet_title,
        first.lead_magnet_slug as first_lead_magnet_slug,
        first.first_signup_at,
        first.latest_signup_at,
        first.signup_count::text as signup_count,
        coalesce(
          case
            when run.id is null then 'none'
            when run.status = 'active'
              and run.scheduled_end_at is not null
              and run.scheduled_end_at <= now()
              then 'completed'
            else run.status
          end,
          'none'
        ) as follow_up_status,
        run.stopped_at as follow_up_stopped_at,
        coalesce(run.stop_reason, '') as follow_up_stop_reason,
        (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'question', response.question,
                'optionLabel', response.option_label,
                'destinationUrl', response.destination_url,
                'createdAt', response.created_at
              ) order by response.created_at asc
            ),
            '[]'::jsonb
          )
          from public.magnets_quiz_responses response
          join public.magnets_submissions response_submission
            on response_submission.id = response.submission_id
          where response.account_id = $1::uuid
            and lower(response_submission.email) = lower(first.email)
        ) as quiz_answers
      from ranked first
      join ranked latest
        on lower(latest.email) = lower(first.email)
       and latest.latest_rank = 1
      left join public.magnets_follow_up_runs run
        on run.account_id = $1::uuid
       and run.lead_magnet_id = first.lead_magnet_id
       and run.email = lower(first.email)
      where first.first_rank = 1
      order by first.latest_signup_at desc
    `,
    [accountId, options.leadMagnetId ?? null]
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

/**
 * Save an answer only when the submission, magnet, and account belong together.
 * The public quiz endpoint never receives an account id it can trust.
 */
export async function recordQuizResponse(input: {
  submissionId: string;
  leadMagnetId: string;
  questionId: string;
  optionId: string;
}): Promise<{ response: QuizResponse; completed: boolean; destinationUrl: string } | null> {
  const context = await query<LeadMagnetJsonRow>(
    `
      select
        row_to_json(lm) as lead_magnet
      from public.magnets_submissions submission
      join public.magnets_lead_magnets lm
        on lm.id = submission.lead_magnet_id
      where submission.id = $1::uuid
        and submission.lead_magnet_id = $2::uuid
        and lm.published = true
      limit 1
    `,
    [input.submissionId, input.leadMagnetId]
  );
  const row = context.rows[0];
  if (!row) return null;

  const leadMagnet = mapLeadMagnet(row.lead_magnet);
  if (leadMagnet.postSignupMode !== 'page' || !leadMagnet.postSignupQuizEnabled) return null;

  const question = leadMagnet.postSignupQuizQuestions.find((item) => item.id === input.questionId);
  const option = question?.options.find((item) => item.id === input.optionId);
  if (!question || !option) return null;

  const result = await query<QuizResponseRow>(
    `
      insert into public.magnets_quiz_responses (
        account_id,
        lead_magnet_id,
        submission_id,
        question_id,
        question,
        option_id,
        option_label,
        destination_url
      )
      select
        submission.account_id,
        submission.lead_magnet_id,
        submission.id,
        $3,
        $4,
        $5,
        $6,
        ''
      from public.magnets_submissions submission
      where submission.id = $1::uuid
        and submission.lead_magnet_id = $2::uuid
      on conflict (submission_id, question_id) do update
      set
        question = excluded.question,
        option_id = excluded.option_id,
        option_label = excluded.option_label,
        destination_url = excluded.destination_url
      returning *
    `,
    [
      input.submissionId,
      input.leadMagnetId,
      input.questionId,
      question.prompt,
      option.id,
      option.label,
    ]
  );

  const saved = result.rows[0];
  if (!saved) return null;

  const answerRows = await query<Pick<QuizResponseRow, 'question_id' | 'option_id'>>(
    `
      select question_id, option_id
      from public.magnets_quiz_responses
      where submission_id = $1::uuid
        and lead_magnet_id = $2::uuid
    `,
    [input.submissionId, input.leadMagnetId]
  );
  const selectedAnswers = answerRows.rows.map((answer) => ({
    questionId: answer.question_id,
    optionId: answer.option_id,
  }));
  const progress = resolveQuizProgress(
    leadMagnet.postSignupQuizQuestions,
    leadMagnet.postSignupQuizRoutes,
    selectedAnswers
  );

  if (progress.completed) {
    // Completion is an immutable outcome of this successful signup. Updating
    // the same nullable timestamp makes retries and double-clicks idempotent.
    await query(
      `
        update public.magnets_submissions
        set post_signup_quiz_completed_at = coalesce(
          post_signup_quiz_completed_at,
          now()
        )
        where id = $1::uuid
          and lead_magnet_id = $2::uuid
      `,
      [input.submissionId, input.leadMagnetId]
    );
  }

  return {
    response: mapQuizResponse(saved),
    ...progress,
  };
}

export function followUpSequenceFingerprint(leadMagnet: Pick<LeadMagnet, 'followUpEmails' | 'followUpStopOnBooking'>) {
  return createHash('sha256')
    .update(JSON.stringify({
      stopOnBooking: leadMagnet.followUpStopOnBooking,
      emails: leadMagnet.followUpEmails.map((email) => ({
        delayMinutes: email.delayMinutes,
        delayHours: email.delayHours,
        subject: email.subject,
        preview: email.preview,
        body: email.body,
      })),
    }))
    .digest('hex');
}

export async function createFollowUpRun(input: {
  accountId: string;
  leadMagnetId: string;
  email: string;
  name: string;
  sequenceFingerprint: string;
  scheduledEndAt: Date | null;
}) {
  const result = await query<FollowUpRunRow>(
    `
      insert into public.magnets_follow_up_runs (
        account_id,
        lead_magnet_id,
        email,
        name,
        sequence_fingerprint,
        scheduled_end_at
      )
      values ($1, $2, $3, $4, $5, $6)
      on conflict (lead_magnet_id, email) do update
      set
        name = excluded.name,
        status = 'active',
        stop_reason = '',
        sequence_fingerprint = excluded.sequence_fingerprint,
        scheduled_end_at = excluded.scheduled_end_at,
        stopped_at = null,
        started_at = now(),
        updated_at = now()
      where public.magnets_follow_up_runs.status <> 'active'
         or public.magnets_follow_up_runs.scheduled_end_at <= now()
      returning *
    `,
    [
      input.accountId,
      input.leadMagnetId,
      input.email.trim().toLowerCase(),
      input.name.trim().slice(0, 120),
      input.sequenceFingerprint,
      input.scheduledEndAt,
    ]
  );

  const row = result.rows[0];
  return {
    created: Boolean(row),
    runId: row?.id || null,
  };
}

export async function markFollowUpRunFailed(runId: string, reason: string) {
  await query(
    `
      update public.magnets_follow_up_runs
      set
        status = 'failed',
        stop_reason = $2,
        stopped_at = now(),
        updated_at = now()
      where id = $1
    `,
    [runId, reason.slice(0, 200)]
  );
}

export async function stopFollowUpRunForEmail(input: {
  accountId: string;
  leadMagnetId: string;
  email: string;
  reason: string;
}) {
  const result = await query<FollowUpRunRow>(
    `
      update public.magnets_follow_up_runs
      set
        status = 'stopped',
        stop_reason = $4,
        stopped_at = now(),
        updated_at = now()
      where account_id = $1::uuid
        and lead_magnet_id = $2::uuid
        and email = lower($3)
        and status = 'active'
      returning *
    `,
    [
      input.accountId,
      input.leadMagnetId,
      input.email.trim(),
      input.reason.slice(0, 80),
    ]
  );

  return {
    stopped: result.rows.length > 0,
    runId: result.rows[0]?.id || null,
  };
}

export async function listActiveStopOnBookingFollowUpRunsForEmail(input: {
  accountId: string;
  email: string;
}) {
  const result = await query<{ lead_magnet_id: string }>(
    `
      select run.lead_magnet_id
      from public.magnets_follow_up_runs run
      join public.magnets_lead_magnets lm
        on lm.id = run.lead_magnet_id
       and lm.account_id = run.account_id
      where run.account_id = $1::uuid
        and run.email = lower($2)
        and run.status = 'active'
        and lm.follow_up_stop_on_booking = true
    `,
    [input.accountId, input.email.trim()]
  );

  return result.rows.map((row) => row.lead_magnet_id);
}

export async function stopFollowUpRunsForAccountEmail(input: {
  accountId: string;
  email: string;
  reason: string;
}) {
  const result = await query<FollowUpRunRow>(
    `
      update public.magnets_follow_up_runs run
      set
        status = 'stopped',
        stop_reason = $3,
        stopped_at = now(),
        updated_at = now()
      from public.magnets_lead_magnets lm
      where run.account_id = $1::uuid
        and run.lead_magnet_id = lm.id
        and lm.account_id = $1::uuid
        and lm.follow_up_stop_on_booking = true
        and run.email = lower($2)
        and run.status = 'active'
      returning run.*
    `,
    [input.accountId, input.email.trim(), input.reason.slice(0, 80)]
  );

  return {
    stopped: result.rows.length > 0,
    stoppedCount: result.rows.length,
    leadMagnetIds: result.rows.map((row) => row.lead_magnet_id),
  };
}

export async function hasActiveFollowUpRunForEmail(input: {
  accountId: string;
  leadMagnetId: string;
  email: string;
}) {
  const result = await query<{ id: string }>(
    `
      select id
      from public.magnets_follow_up_runs
      where account_id = $1::uuid
        and lead_magnet_id = $2::uuid
        and email = lower($3)
        and status = 'active'
      limit 1
    `,
    [input.accountId, input.leadMagnetId, input.email.trim()]
  );

  return result.rows.length > 0;
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
