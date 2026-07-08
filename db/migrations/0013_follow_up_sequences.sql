ALTER TABLE "magnets_accounts"
  ADD COLUMN IF NOT EXISTS "calendar_webhook_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "calendar_webhook_token" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "magnets_lead_magnets"
  ADD COLUMN IF NOT EXISTS "follow_up_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "follow_up_stop_on_booking" boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS "follow_up_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS "resend_follow_up_automation_id" text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "magnets_follow_up_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "lead_magnet_id" uuid NOT NULL,
  "email" text NOT NULL,
  "name" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "stop_reason" text DEFAULT '' NOT NULL,
  "sequence_fingerprint" text DEFAULT '' NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "scheduled_end_at" timestamp with time zone,
  "stopped_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "magnets_follow_up_runs_account_id_magnets_accounts_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "public"."magnets_accounts"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "magnets_follow_up_runs_lead_magnet_id_magnets_lead_magnets_id_fk"
    FOREIGN KEY ("lead_magnet_id") REFERENCES "public"."magnets_lead_magnets"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "magnets_follow_up_runs_magnet_email_unique"
  ON "magnets_follow_up_runs" ("lead_magnet_id", "email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "magnets_follow_up_runs_account_status_idx"
  ON "magnets_follow_up_runs" ("account_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "magnets_follow_up_runs_account_email_idx"
  ON "magnets_follow_up_runs" ("account_id", "email");
