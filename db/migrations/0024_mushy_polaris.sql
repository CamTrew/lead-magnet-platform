CREATE TABLE "magnets_hosted_resources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"original_filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"blob_url" text NOT NULL,
	"public_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "magnets_hosted_resources" ADD CONSTRAINT "magnets_hosted_resources_account_id_magnets_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."magnets_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "magnets_hosted_resources_blob_url_unique" ON "magnets_hosted_resources" USING btree ("blob_url");--> statement-breakpoint
CREATE UNIQUE INDEX "magnets_hosted_resources_public_token_unique" ON "magnets_hosted_resources" USING btree ("public_token");--> statement-breakpoint
CREATE INDEX "magnets_hosted_resources_account_created_idx" ON "magnets_hosted_resources" USING btree ("account_id","created_at");