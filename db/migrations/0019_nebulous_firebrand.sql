CREATE TABLE "magnets_password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "magnets_password_reset_tokens_token_hash_unique" ON "magnets_password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "magnets_password_reset_tokens_user_created_idx" ON "magnets_password_reset_tokens" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "magnets_password_reset_tokens_expires_at_idx" ON "magnets_password_reset_tokens" USING btree ("expires_at");