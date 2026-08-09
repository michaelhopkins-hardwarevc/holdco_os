CREATE TYPE "public"."party_match_type" AS ENUM('email_domain', 'name_variant');--> statement-breakpoint
CREATE TYPE "public"."source_system" AS ENUM('microsoft', 'google', 'monday', 'hubspot');--> statement-breakpoint
CREATE TABLE "crosswalk_party" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"match_type" "party_match_type" NOT NULL,
	"match_value" text NOT NULL,
	"hubspot_company_id" text,
	"client_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "crosswalk_party_match_unique" UNIQUE("entity_id","match_type","match_value")
);
--> statement-breakpoint
ALTER TABLE "crosswalk_party" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crosswalk_person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"source_system" "source_system" NOT NULL,
	"source_user_id" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "crosswalk_person_source_unique" UNIQUE("entity_id","source_system","source_user_id")
);
--> statement-breakpoint
ALTER TABLE "crosswalk_person" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crosswalk_project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"monday_board_id" text,
	"sharepoint_folder" text,
	"hubspot_deal_id" text,
	"xero_tracking_option" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "crosswalk_project_project_unique" UNIQUE("entity_id","project_id")
);
--> statement-breakpoint
ALTER TABLE "crosswalk_project" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crosswalk_party" ADD CONSTRAINT "crosswalk_party_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crosswalk_party" ADD CONSTRAINT "crosswalk_party_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crosswalk_party" ADD CONSTRAINT "crosswalk_party_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crosswalk_person" ADD CONSTRAINT "crosswalk_person_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crosswalk_person" ADD CONSTRAINT "crosswalk_person_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crosswalk_person" ADD CONSTRAINT "crosswalk_person_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crosswalk_project" ADD CONSTRAINT "crosswalk_project_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crosswalk_project" ADD CONSTRAINT "crosswalk_project_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crosswalk_project" ADD CONSTRAINT "crosswalk_project_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crosswalk_project" ADD CONSTRAINT "crosswalk_project_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE no action ON UPDATE no action;