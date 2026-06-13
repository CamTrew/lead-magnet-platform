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
  | 'attached-pending'    // attached to Vercel, CNAME not resolving yet
  | 'live';               // Vercel reports the domain as verified

export interface AccountSettings {
  id: string;
  ownerUserId: string;
  subdomain: string;
  domain: string;
  logoUrl: string;
  logoText: string;
  brand: BrandSettings;
  resendFromEmail: string;
  resendApiKey: string;
  beehiivApiKey: string;
  beehiivPublicationId: string;
  substackPublication: string;
  domainVerificationToken: string;
  domainVerifiedAt: string | null;
  domainAttachedHost: string;
  domainRecommendedCname: string;
  onboardingCompletedAt: string | null;
  onboarding: OnboardingAnswers;
  createdAt: string;
  updatedAt: string;
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
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Submission {
  id: string;
  accountId: string;
  leadMagnetId: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface AccountSignup {
  email: string;
  name: string;
  firstLeadMagnetTitle: string;
  firstLeadMagnetSlug: string;
  firstSignupAt: string;
  latestSignupAt: string;
  signupCount: number;
}

export interface PlatformData {
  users: PlatformUser[];
  accounts: AccountSettings[];
  leadMagnets: LeadMagnet[];
  submissions: Submission[];
}

export interface DashboardPayload {
  user: PlatformUser;
  account: AccountSettings;
  leadMagnets: LeadMagnet[];
}
