export interface NeonAuthUser {
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

export interface AccountSettings {
  id: string;
  ownerUserId: string;
  name: string;
  subdomain: string;
  domain: string;
  logoUrl: string;
  brand: BrandSettings;
  resendApiKey: string;
  resendFromEmail: string;
  beehiivApiKey: string;
  beehiivPublicationId: string;
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

export interface PlatformData {
  users: NeonAuthUser[];
  accounts: AccountSettings[];
  leadMagnets: LeadMagnet[];
  submissions: Submission[];
}

export interface DashboardPayload {
  user: NeonAuthUser;
  account: AccountSettings;
  leadMagnets: LeadMagnet[];
}

