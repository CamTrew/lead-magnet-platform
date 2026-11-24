import type { DashboardBasePayload, LeadMagnet } from './types';
import { exampleCampaign } from './campaign-example';

export const sampleMagnetId = '39f7a8e6-13a1-4c8f-8bd6-fe5f88c8088d';
const timestamp = '2026-11-24T00:00:00.000Z';

export const sampleWorkspace: DashboardBasePayload = {
  user: { id: 'sample-user', name: 'Studio North', email: 'creator@example.invalid', createdAt: timestamp, updatedAt: timestamp },
  account: {
    id: 'sample-workspace', ownerUserId: 'sample-user', username: 'studio-north',
    logoText: 'Studio North', logoUrl: '', domain: '', subdomain: '',
    brand: { primary: '#161616', accent: '#FE6F34', success: '#168057', highlightIntensity: 80,
      pageTheme: 'light', logoSize: 'small', privacyPolicyUrl: '', termsUrl: '' },
    resendFromEmail: '', resendApiKey: '', resendConfigured: false, resendManagedByPlatform: false,
    resendReturnPath: '', beehiivApiKey: '', beehiivPublicationId: '', substackPublication: '',
    kitAccessToken: '', kitRefreshToken: '', kitTokenExpiresAt: null, kitAccountId: '', kitAccountName: '', kitConnected: false,
    slackWebhookUrl: '', zapierWebhookUrl: '', pipedriveApiToken: '',
    calendarWebhookEnabled: false, calendarWebhookToken: '', calendarProvider: '', calendarApiKey: '',
    calendarWebhookSecret: '', calendarWebhookId: '', calendarConnectedAt: null,
    domainVerificationToken: '', domainVerifiedAt: null, domainAttachedHost: '', domainRecommendedCname: '',
    onboardingCompletedAt: timestamp, onboarding: { businessName: 'Studio North', businessType: '', magnetType: 'checklist', cadence: '' },
    createdAt: timestamp, updatedAt: timestamp,
  },
};

export const sampleMagnet: LeadMagnet = {
  ...exampleCampaign.page, id: sampleMagnetId, accountId: sampleWorkspace.account.id,
  slug: 'project-pricing-checklist', title: exampleCampaign.title, imageUrl: '', signupFields: [],
  downloadLink: '', emailSubject: exampleCampaign.delivery.subject, emailPreview: exampleCampaign.delivery.preview,
  emailBody: exampleCampaign.delivery.body, followUpEnabled: false, followUpStopOnBooking: false, followUpEmails: [],
  resendFollowUpAutomationId: '', resendFollowUpRenderVersion: 0, postSignupMode: 'message',
  postSignupRedirectUrl: '', postSignupHeading: 'Check your inbox', postSignupBody: '', postSignupVideoUrl: '',
  postSignupCtaLabel: '', postSignupCtaUrl: '', postSignupQuizEnabled: false, postSignupQuizTitle: '',
  postSignupQuizDescription: '', postSignupQuizQuestions: [], postSignupQuizRoutes: [], abTestEnabled: false,
  abTestVariants: [], abTestStartedAt: '', abTestCompletedAt: '', abTestWinnerId: '',
  published: false, createdAt: timestamp, updatedAt: timestamp,
};
