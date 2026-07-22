export const MAX_LEAD_MAGNETS_PER_ACCOUNT = 250;
export const MAX_HOSTED_RESOURCES_PER_ACCOUNT = 100;
export const MAX_HOSTED_RESOURCE_BYTES = 50 * 1024 * 1024;
export const MAX_HOSTED_RESOURCE_STORAGE_BYTES = 1024 * 1024 * 1024;

export const AI_REQUESTS_PER_ACCOUNT_PER_DAY = 75;
export const AI_REQUESTS_BY_ACTION_PER_DAY = {
  copilot: 50,
  draft: 15,
  quizInsights: 10,
} as const;

export const AB_TEST_MINIMUM_DAYS = 7;
export const AB_TEST_MINIMUM_VISITS_PER_VERSION = 25;
