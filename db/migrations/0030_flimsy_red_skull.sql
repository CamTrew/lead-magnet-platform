ALTER TABLE "magnets_lead_magnet_visits" ADD COLUMN "variant_id" text DEFAULT 'control' NOT NULL;--> statement-breakpoint
ALTER TABLE "magnets_lead_magnets" ADD COLUMN "ab_test_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "magnets_lead_magnets" ADD COLUMN "ab_test_variants" jsonb DEFAULT '[]'::jsonb NOT NULL;