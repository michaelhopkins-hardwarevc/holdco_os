ALTER TABLE "expense" ADD COLUMN "invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "time_entry" ADD COLUMN "invoice_id" uuid;