CREATE TABLE "magnets_lead_magnet_copilot_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lead_magnet_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"updated_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "magnets_lead_magnet_copilot_messages" ADD CONSTRAINT "magnets_lead_magnet_copilot_messages_lead_magnet_id_magnets_lead_magnets_id_fk" FOREIGN KEY ("lead_magnet_id") REFERENCES "public"."magnets_lead_magnets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "magnets_copilot_messages_magnet_id_idx" ON "magnets_lead_magnet_copilot_messages" USING btree ("lead_magnet_id","id");