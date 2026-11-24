CREATE TABLE "magnets_assistant_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"redirect_uris" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magnets_assistant_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"resource" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"challenge" text NOT NULL,
	"code_hash" text,
	"access_hash" text,
	"refresh_hash" text,
	"code_expires_at" timestamp with time zone NOT NULL,
	"access_expires_at" timestamp with time zone,
	"refresh_expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magnets_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"lead_magnet_id" uuid,
	"request_id" text NOT NULL,
	"brief" text DEFAULT '' NOT NULL,
	"content" jsonb NOT NULL,
	"public_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"cover_data" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "magnets_assistant_grants" ADD CONSTRAINT "magnets_assistant_grants_account_id_magnets_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."magnets_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magnets_assistant_grants" ADD CONSTRAINT "magnets_assistant_grants_client_id_magnets_assistant_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."magnets_assistant_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magnets_campaigns" ADD CONSTRAINT "magnets_campaigns_account_id_magnets_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."magnets_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magnets_campaigns" ADD CONSTRAINT "magnets_campaigns_lead_magnet_id_magnets_lead_magnets_id_fk" FOREIGN KEY ("lead_magnet_id") REFERENCES "public"."magnets_lead_magnets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "magnets_assistant_code_unique" ON "magnets_assistant_grants" USING btree ("code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "magnets_assistant_access_unique" ON "magnets_assistant_grants" USING btree ("access_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "magnets_assistant_refresh_unique" ON "magnets_assistant_grants" USING btree ("refresh_hash");--> statement-breakpoint
CREATE INDEX "magnets_assistant_account_idx" ON "magnets_assistant_grants" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "magnets_campaigns_request_unique" ON "magnets_campaigns" USING btree ("account_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "magnets_campaigns_public_token_unique" ON "magnets_campaigns" USING btree ("public_token");