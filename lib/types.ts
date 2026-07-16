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
  slackWebhookUrl: string;
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
  published: boolean;
  createdAt: string;
  updatedAt: string;
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
