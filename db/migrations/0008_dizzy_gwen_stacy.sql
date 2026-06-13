ALTER TABLE "magnets_accounts" ADD COLUMN IF NOT EXISTS "domain_verification_token" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "magnets_accounts" ADD COLUMN IF NOT EXISTS "domain_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "magnets_accounts" ADD COLUMN IF NOT EXISTS "domain_attached_host" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "magnets_accounts" ADD COLUMN IF NOT EXISTS "domain_recommended_cname" text DEFAULT '' NOT NULL;
