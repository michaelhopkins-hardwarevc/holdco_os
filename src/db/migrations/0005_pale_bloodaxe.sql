CREATE TABLE "signal_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"match_value" text NOT NULL,
	"charge_type" charge_type NOT NULL,
	"project_id" uuid,
	"phase_id" uuid,
	"indirect_code_id" uuid,
	"hit_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "signal_rule_resource_match_unique" UNIQUE("resource_id","match_value")
);
--> statement-breakpoint
ALTER TABLE "signal_rule" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "signal_rule" ADD CONSTRAINT "signal_rule_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_rule" ADD CONSTRAINT "signal_rule_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_rule" ADD CONSTRAINT "signal_rule_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_rule" ADD CONSTRAINT "signal_rule_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_rule" ADD CONSTRAINT "signal_rule_phase_id_phase_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phase"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_rule" ADD CONSTRAINT "signal_rule_indirect_code_id_indirect_code_id_fk" FOREIGN KEY ("indirect_code_id") REFERENCES "public"."indirect_code"("id") ON DELETE no action ON UPDATE no action;