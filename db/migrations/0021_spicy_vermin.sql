CREATE TABLE "magnets_quiz_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"lead_magnet_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"question_id" text NOT NULL,
	"question" text DEFAULT '' NOT NULL,
	"option_id" text NOT NULL,
	"option_label" text DEFAULT '' NOT NULL,
	"destination_url" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "magnets_lead_magnets" ADD COLUMN "post_signup_mode" text DEFAULT 'message' NOT NULL;--> statement-breakpoint
ALTER TABLE "magnets_lead_magnets" ADD COLUMN "post_signup_redirect_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "magnets_lead_magnets" ADD COLUMN "post_signup_heading" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "magnets_lead_magnets" ADD COLUMN "post_signup_body" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "magnets_lead_magnets" ADD COLUMN "post_signup_video_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "magnets_lead_magnets" ADD COLUMN "post_signup_cta_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "magnets_lead_magnets" ADD COLUMN "post_signup_cta_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "magnets_lead_magnets" ADD COLUMN "post_signup_quiz_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "magnets_lead_magnets" ADD COLUMN "post_signup_quiz_title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "magnets_lead_magnets" ADD COLUMN "post_signup_quiz_description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "magnets_lead_magnets" ADD COLUMN "post_signup_quiz_questions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "magnets_quiz_responses" ADD CONSTRAINT "magnets_quiz_responses_account_id_magnets_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."magnets_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magnets_quiz_responses" ADD CONSTRAINT "magnets_quiz_responses_lead_magnet_id_magnets_lead_magnets_id_fk" FOREIGN KEY ("lead_magnet_id") REFERENCES "public"."magnets_lead_magnets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magnets_quiz_responses" ADD CONSTRAINT "magnets_quiz_responses_submission_id_magnets_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."magnets_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "magnets_quiz_responses_submission_question_unique" ON "magnets_quiz_responses" USING btree ("submission_id","question_id");--> statement-breakpoint
CREATE INDEX "magnets_quiz_responses_account_created_idx" ON "magnets_quiz_responses" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "magnets_quiz_responses_magnet_created_idx" ON "magnets_quiz_responses" USING btree ("lead_magnet_id","created_at");