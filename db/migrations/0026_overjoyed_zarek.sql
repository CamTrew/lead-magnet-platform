ALTER TABLE "magnets_accounts" ADD COLUMN "kit_access_token" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "magnets_accounts" ADD COLUMN "kit_refresh_token" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "magnets_accounts" ADD COLUMN "kit_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "magnets_accounts" ADD COLUMN "kit_account_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "magnets_accounts" ADD COLUMN "kit_account_name" text DEFAULT '' NOT NULL;