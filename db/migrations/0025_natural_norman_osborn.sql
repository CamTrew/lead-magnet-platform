CREATE TABLE "magnets_lead_magnet_visits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"lead_magnet_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"engaged_seconds" integer DEFAULT 0 NOT NULL,
	"converted_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "magnets_lead_magnet_visits" ADD CONSTRAINT "magnets_lead_magnet_visits_account_id_magnets_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."magnets_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magnets_lead_magnet_visits" ADD CONSTRAINT "magnets_lead_magnet_visits_lead_magnet_id_magnets_lead_magnets_id_fk" FOREIGN KEY ("lead_magnet_id") REFERENCES "public"."magnets_lead_magnets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "magnets_lead_magnet_visits_magnet_session_unique" ON "magnets_lead_magnet_visits" USING btree ("lead_magnet_id","session_id");--> statement-breakpoint
CREATE INDEX "magnets_lead_magnet_visits_account_first_seen_idx" ON "magnets_lead_magnet_visits" USING btree ("account_id","first_seen_at");--> statement-breakpoint
CREATE INDEX "magnets_lead_magnet_visits_magnet_first_seen_idx" ON "magnets_lead_magnet_visits" USING btree ("lead_magnet_id","first_seen_at");--> statement-breakpoint
CREATE INDEX "magnets_lead_magnet_visits_magnet_converted_idx" ON "magnets_lead_magnet_visits" USING btree ("lead_magnet_id","converted_at");