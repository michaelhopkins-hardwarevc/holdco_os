CREATE TYPE "public"."event_hardness" AS ENUM('hard', 'soft');--> statement-breakpoint
CREATE TABLE "activity_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"person_id" uuid,
	"source_system" "source_system" NOT NULL,
	"source_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"hardness" "event_hardness" NOT NULL,
	"raw_payload" jsonb,
	"resolved_project_id" uuid,
	"resolved_client_id" uuid,
	"resolution_confidence" "signal_confidence",
	"matched_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "activity_event_source_unique" UNIQUE("entity_id","source_system","source_event_id")
);
--> statement-breakpoint
ALTER TABLE "activity_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_person_id_resource_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."resource"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_resolved_project_id_project_id_fk" FOREIGN KEY ("resolved_project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_resolved_client_id_client_id_fk" FOREIGN KEY ("resolved_client_id") REFERENCES "public"."client"("id") ON DELETE no action ON UPDATE no action;