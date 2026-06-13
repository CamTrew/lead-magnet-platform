ALTER TABLE "magnets_accounts" ADD COLUMN IF NOT EXISTS "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "magnets_accounts" ADD COLUMN IF NOT EXISTS "onboarding_business_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "magnets_accounts" ADD COLUMN IF NOT EXISTS "onboarding_business_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "magnets_accounts" ADD COLUMN IF NOT EXISTS "onboarding_magnet_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "magnets_accounts" ADD COLUMN IF NOT EXISTS "onboarding_cadence" text DEFAULT '' NOT NULL;
