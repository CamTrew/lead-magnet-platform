ALTER TABLE "magnets_accounts" ADD COLUMN IF NOT EXISTS "resend_return_path" text DEFAULT '' NOT NULL;
