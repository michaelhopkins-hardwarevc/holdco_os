CREATE TYPE "public"."source_ref_rule_kind" AS ENUM('project', 'indirect', 'ignore');--> statement-breakpoint
CREATE TABLE "source_ref_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"source_ref" text NOT NULL,
	"kind" "source_ref_rule_kind" NOT NULL,
	"project_id" uuid,
	"indirect_code_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "source_ref_rule_ref_unique" UNIQUE("entity_id","source_ref")
);
--> statement-breakpoint
ALTER TABLE "source_ref_rule" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_event" ADD COLUMN "resolved_indirect_code_id" uuid;--> statement-breakpoint
ALTER TABLE "source_ref_rule" ADD CONSTRAINT "source_ref_rule_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_ref_rule" ADD CONSTRAINT "source_ref_rule_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_ref_rule" ADD CONSTRAINT "source_ref_rule_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_ref_rule" ADD CONSTRAINT "source_ref_rule_indirect_code_id_indirect_code_id_fk" FOREIGN KEY ("indirect_code_id") REFERENCES "public"."indirect_code"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_resolved_indirect_code_id_indirect_code_id_fk" FOREIGN KEY ("resolved_indirect_code_id") REFERENCES "public"."indirect_code"("id") ON DELETE no action ON UPDATE no action;