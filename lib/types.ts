export interface PlatformUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface BrandSettings {
  primary: string;
  accent: string;
  success: string;
  highlightIntensity: number;
  pageTheme: 'light' | 'dark';
  privacyPolicyUrl: string;
  termsUrl: string;
}

export interface OnboardingAnswers {
  businessName: string;
  businessType: string;
  magnetType: string;
  cadence: string;
}

export type DomainStage =
  | 'no-domain'           // domain field empty
  | 'unverified'          // domain set, ownership TXT not yet observed
  | 'verified'            // ownership proven, not yet attached to Vercel
  | 'attached-pending'    // attached or believed attached, but not serving yet
  | 'live';               // Vercel reports the domain as verified

export type CalendarProvider = '' | 'calendly' | 'calcom';

export interface AccountSettings {
  id: string;
  ownerUserId: string;
  username: string;
  subdomain: string;
  domain: string;
  logoUrl: string;
  logoText: string;
  brand: BrandSettings;
  resendFromEmail: string;
  resendApiKey: string;
  resendConfigured: boolean;
  resendManagedByPlatform: boolean;
  beehiivApiKey: string;
  beehiivPublicationId: string;
  substackPublication: string;
  kitAccessToken: string;
  kitRefreshToken: string;
  kitTokenExpiresAt: string | null;
  kitAccountId: string;
  kitAccountName: string;
  kitConnected: boolean;
  slackWebhookUrl: string;
  zapierWebhookUrl: string;
  pipedriveApiToken: string;
  resendReturnPath: string;
  calendarWebhookEnabled: boolean;
  calendarWebhookToken: string;
  calendarProvider: CalendarProvider;
  calendarApiKey: string;
  calendarWebhookSecret: string;
  calendarWebhookId: string;
  calendarConnectedAt: string | null;
  domainVerificationToken: string;
  domainVerifiedAt: string | null;
  domainAttachedHost: string;
  domainRecommendedCname: string;
  onboardingCompletedAt: string | null;
  onboarding: OnboardingAnswers;
  createdAt: string;
  updatedAt: string;
}

export interface FollowUpEmail {
  id: string;
  delayMinutes: number;
  delayHours: number;
  subject: string;
  preview: string;
  body: string;
  resendTemplateId: string;
}

export type PostSignupMode = 'message' | 'redirect' | 'page';

export interface PostSignupQuizOption {
  id: string;
  label: string;
  destinationUrl: string;
}

export interface PostSignupQuizQuestion {
  id: string;
  prompt: string;
  options: PostSignupQuizOption[];
}

export interface PostSignupQuizRouteCondition {
  questionId: string;
  optionId: string;
}

export interface PostSignupQuizRoute {
  id: string;
  destinationUrl: string;
  conditions: PostSignupQuizRouteCondition[];
}

export interface PostSignupQuizConfig {
  questions: PostSignupQuizQuestion[];
  routes: PostSignupQuizRoute[];
}

export interface QuizResponse {
  id: string;
  accountId: string;
  leadMagnetId: string;
  submissionId: string;
  questionId: string;
  question: string;
  optionId: string;
  optionLabel: string;
  destinationUrl: string;
  createdAt: string;
}

export interface LeadMagnetAbVariant {
  id: string;
  name: string;
  title: string;
  subtitle: string;
  imageUrl: string;
}

export interface LeadMagnet {
  id: string;
  accountId: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  bullets: string[];
  bulletsHeading: string;
  ctaText: string;
  formHeading: string;
  formSubtext: string;
  imageUrl: string;
  downloadLink: string;
  emailSubject: string;
  emailBody: string;
  emailPreview: string;
  followUpEnabled: boolean;
  followUpStopOnBooking: boolean;
  followUpEmails: FollowUpEmail[];
  resendFollowUpAutomationId: string;
  resendFollowUpRenderVersion: number;
  postSignupMode: PostSignupMode;
  postSignupRedirectUrl: string;
  postSignupHeading: string;
  postSignupBody: string;
  postSignupVideoUrl: string;
  postSignupCtaLabel: string;
  postSignupCtaUrl: string;
  postSignupQuizEnabled: boolean;
  postSignupQuizTitle: string;
  postSignupQuizDescription: string;
  postSignupQuizQuestions: PostSignupQuizQuestion[];
  postSignupQuizRoutes: PostSignupQuizRoute[];
  abTestEnabled: boolean;
  abTestVariants: LeadMagnetAbVariant[];
  abTestStartedAt: string;
  abTestCompletedAt: string;
  abTestWinnerId: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export type LeadMagnetVersionSource = 'baseline' | 'autosave' | 'manual' | 'restore';

// Version snapshots contain only user-editable content. Provider automation
// IDs are deliberately excluded: restoring copy must never resurrect an old
// Resend automation or template reference.
export type LeadMagnetVersionSnapshot = Omit<
  LeadMagnet,
  | 'id'
  | 'accountId'
  | 'createdAt'
  | 'updatedAt'
  | 'resendFollowUpAutomationId'
  | 'resendFollowUpRenderVersion'
  | 'abTestStartedAt'
  | 'abTestCompletedAt'
  | 'abTestWinnerId'
>;

export interface LeadMagnetVersionSummary {
  id: string;
  source: LeadMagnetVersionSource;
  createdAt: string;
  title: string;
  emailSubject: string;
}

export interface HostedResource {
  id: string;
  accountId: string;
  name: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  publicToken: string;
  publicUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeadMagnetAnalyticsDay {
  date: string;
  visits: number;
  conversions: number;
}

export interface LeadMagnetAnalytics {
  totalVisits: number;
  totalSignups: number;
  uniqueSignups: number;
  totalConversions: number;
  totalVideoPlays: number;
  totalQuizCompletions: number;
  conversionRate: number;
  averageEngagedSeconds: number;
  recentVisits: number;
  recentSignups: number;
  recentUniqueSignups: number;
  recentConversions: number;
  recentVideoPlays: number;
  recentQuizCompletions: number;
  daily: LeadMagnetAnalyticsDay[];
  variants: Array<{
    variantId: string;
    name: string;
    visits: number;
    conversions: number;
    conversionRate: number;
  }>;
}

export interface QuizInsightsData {
  completionCount: number;
  responseCount: number;
  questions: Array<{
    question: string;
    answers: Array<{ label: string; count: number; percentage: number }>;
  }>;
}

export type LeadMagnetSummary = Pick<
  LeadMagnet,
  'id' | 'accountId' | 'slug' | 'title' | 'subtitle' | 'imageUrl' | 'published' | 'createdAt' | 'updatedAt'
>;

export type LeadMagnetOption = Pick<LeadMagnet, 'id' | 'title' | 'slug'>;

export type FollowUpStatus = 'none' | 'active' | 'stopped' | 'completed' | 'failed';

export interface Submission {
  id: string;
  accountId: string;
  leadMagnetId: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface SignupQuizAnswer {
  question: string;
  optionLabel: string;
  destinationUrl: string;
  createdAt: string;
}

export interface AccountSignup {
  email: string;
  name: string;
  leadMagnets: Array<{
    id: string;
    title: string;
    slug: string;
  }>;
  firstLeadMagnetId: string;
  firstLeadMagnetTitle: string;
  firstLeadMagnetSlug: string;
  firstSignupAt: string;
  latestSignupAt: string;
  signupCount: number;
  followUpStatus: FollowUpStatus;
  followUpStoppedAt: string | null;
  followUpStopReason: string;
  quizAnswers: SignupQuizAnswer[];
}

export interface PlatformData {
  users: PlatformUser[];
  accounts: AccountSettings[];
  leadMagnets: LeadMagnet[];
  submissions: Submission[];
}

export interface DashboardBasePayload {
  user: PlatformUser;
  account: AccountSettings;
}

export interface DashboardPayload extends DashboardBasePayload {
  leadMagnets: LeadMagnet[];
}
