CREATE TABLE "magnets_creation_briefs" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"brief" text NOT NULL,
	"format" text DEFAULT 'checklist' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "magnets_creation_briefs" ADD CONSTRAINT "magnets_creation_briefs_account_id_magnets_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."magnets_accounts"("id") ON DELETE cascade ON UPDATE no action;