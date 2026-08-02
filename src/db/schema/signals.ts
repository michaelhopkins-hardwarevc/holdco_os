import {
  boolean,
  numeric,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  auditColumns,
  chargeType,
  signalConfidence,
  signalState,
} from "./_shared";
import { entity, organization, user } from "./core";
import { indirectCode, phase, project, resource, timeEntry } from "./phase1";

// ---------------------------------------------------------------------------
// Signals (design handoff §"What Signals actually requires").
//
// Signals pre-populate the timesheet from the tools people already use
// (calendar, issue tracker, ...). Nothing writes a time_entry except a person
// accepting a signal.
// ---------------------------------------------------------------------------

// A per-user connection to an external provider (Google Calendar, Linear, ...).
// Read-only scopes; tokens are stored server-side only.
export const sourceConnection = pgTable(
  "source_connection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entity.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    provider: text("provider").notNull(), // google_calendar | linear | figma | git
    status: text("status").notNull().default("disconnected"),
    scopes: text("scopes"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    externalAccountId: text("external_account_id"),
    ...auditColumns(),
  },
  (t) => [
    unique("source_connection_user_provider_unique").on(
      t.entityId,
      t.userId,
      t.provider,
    ),
  ],
).enableRLS();

// A proposed charge with evidence, awaiting the person's decision.
export const signal = pgTable(
  "signal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entity.id),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resource.id),
    workDate: text("work_date").notNull(), // YYYY-MM-DD (matches time_entry.work_date)
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    evidence: text("evidence").notNull(),
    provenance: text("provenance"),
    // Proposed charge: exactly one of project (+phase) or indirect code.
    chargeType: chargeType("charge_type").notNull(),
    projectId: uuid("project_id").references(() => project.id),
    phaseId: uuid("phase_id").references(() => phase.id),
    indirectCodeId: uuid("indirect_code_id").references(() => indirectCode.id),
    proposedHours: numeric("proposed_hours", { precision: 6, scale: 2 })
      .notNull()
      .default("0"),
    confidence: signalConfidence("confidence").notNull().default("med"),
    billable: boolean("billable").notNull().default(true),
    state: signalState("state").notNull().default("open"),
    // Set once accepted — the time_entry this signal produced.
    timeEntryId: uuid("time_entry_id").references(() => timeEntry.id),
    ...auditColumns(),
  },
  (t) => [
    // Idempotent re-syncs: one signal per external item per resource.
    unique("signal_provider_external_resource_unique").on(
      t.provider,
      t.externalId,
      t.resourceId,
    ),
  ],
).enableRLS();
