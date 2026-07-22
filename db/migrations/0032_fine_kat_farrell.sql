CREATE TABLE "magnets_email_verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "magnets_email_verification_tokens_token_hash_unique" ON "magnets_email_verification_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "magnets_email_verification_tokens_user_created_idx" ON "magnets_email_verification_tokens" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "magnets_email_verification_tokens_expires_at_idx" ON "magnets_email_verification_tokens" USING btree ("expires_at");
--> statement-breakpoint
-- Email verification starts with this release. Existing password accounts are
-- trusted so the rollout cannot lock current customers out of their dashboard.
UPDATE neon_auth."user" AS u
SET
	"emailVerified" = true,
	"updatedAt" = now()
WHERE u."emailVerified" = false
	AND EXISTS (
		SELECT 1
		FROM public.magnets_auth_credentials AS c
		WHERE c.user_id = u.id
	);
