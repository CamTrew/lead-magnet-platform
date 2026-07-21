CREATE TABLE "magnets_lead_magnet_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_magnet_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"source" text DEFAULT 'autosave' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "magnets_lead_magnet_versions" ADD CONSTRAINT "magnets_lead_magnet_versions_lead_magnet_id_magnets_lead_magnets_id_fk" FOREIGN KEY ("lead_magnet_id") REFERENCES "public"."magnets_lead_magnets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magnets_lead_magnet_versions" ADD CONSTRAINT "magnets_lead_magnet_versions_account_id_magnets_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."magnets_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "magnets_lead_magnet_versions_magnet_created_idx" ON "magnets_lead_magnet_versions" USING btree ("lead_magnet_id","created_at");--> statement-breakpoint
CREATE INDEX "magnets_lead_magnet_versions_account_created_idx" ON "magnets_lead_magnet_versions" USING btree ("account_id","created_at");