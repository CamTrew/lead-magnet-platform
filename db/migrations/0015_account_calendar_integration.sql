ALTER TABLE "magnets_accounts"
  ADD COLUMN IF NOT EXISTS "calendar_provider" text DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS "calendar_api_key" text DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS "calendar_webhook_secret" text DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS "calendar_webhook_id" text DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS "calendar_connected_at" timestamp with time zone;
