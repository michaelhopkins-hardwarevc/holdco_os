ALTER TABLE "signal" ADD COLUMN "learn_hints" jsonb;--> statement-breakpoint
ALTER TABLE "activity_event" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activity_event" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "activity_event" ADD COLUMN "counterparty" text;--> statement-breakpoint
ALTER TABLE "activity_event" ADD COLUMN "source_ref" text;--> statement-breakpoint
ALTER TABLE "activity_event" ADD COLUMN "signal_id" uuid;