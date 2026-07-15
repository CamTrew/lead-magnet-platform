ALTER TABLE "magnets_accounts" ADD COLUMN "username" text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE "magnets_accounts"
SET "username" = left(
  coalesce(
    nullif(
      regexp_replace(
        regexp_replace(lower("onboarding_business_name"), '[^a-z0-9]+', '-', 'g'),
        '(^-+|-+$)',
        '',
        'g'
      ),
      ''
    ),
    'account'
  ),
  31
) || '-' || substring(replace("id"::text, '-', '') from 1 for 8)
WHERE "username" = '';
--> statement-breakpoint
CREATE UNIQUE INDEX "magnets_accounts_username_unique" ON "magnets_accounts" USING btree ("username") WHERE "magnets_accounts"."username" <> '';
