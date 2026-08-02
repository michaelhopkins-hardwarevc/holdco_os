CREATE TYPE "public"."signal_confidence" AS ENUM('high', 'med', 'low');--> statement-breakpoint
CREATE TYPE "public"."signal_state" AS ENUM('open', 'accepted', 'dismissed');--> statement-breakpoint
CREATE TABLE "signal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"work_date" text NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"evidence" text NOT NULL,
	"provenance" text,
	"charge_type" charge_type NOT NULL,
	"project_id" uuid,
	"phase_id" uuid,
	"indirect_code_id" uuid,
	"proposed_hours" numeric(6, 2) DEFAULT '0' NOT NULL,
	"confidence" "signal_confidence" DEFAULT 'med' NOT NULL,
	"billable" boolean DEFAULT true NOT NULL,
	"state" "signal_state" DEFAULT 'open' NOT NULL,
	"time_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "signal_provider_external_resource_unique" UNIQUE("provider","external_id","resource_id")
);
--> statement-breakpoint
ALTER TABLE "signal" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "source_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"scopes" text,
	"access_token" text,
	"refresh_token" text,
	"external_account_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "source_connection_user_provider_unique" UNIQUE("entity_id","user_id","provider")
);
--> statement-breakpoint
ALTER TABLE "source_connection" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "signal" ADD CONSTRAINT "signal_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal" ADD CONSTRAINT "signal_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal" ADD CONSTRAINT "signal_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal" ADD CONSTRAINT "signal_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal" ADD CONSTRAINT "signal_phase_id_phase_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phase"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal" ADD CONSTRAINT "signal_indirect_code_id_indirect_code_id_fk" FOREIGN KEY ("indirect_code_id") REFERENCES "public"."indirect_code"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal" ADD CONSTRAINT "signal_time_entry_id_time_entry_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_connection" ADD CONSTRAINT "source_connection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_connection" ADD CONSTRAINT "source_connection_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_connection" ADD CONSTRAINT "source_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;