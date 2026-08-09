import {
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  auditColumns,
  eventHardness,
  signalConfidence,
  sourceSystem,
} from "./_shared";
import { entity, organization } from "./core";
import { client, project, resource } from "./phase1";

// ---------------------------------------------------------------------------
// Activity events (WIS Day-One §3 "Capture" + §4).
//
// The raw landing table for captured work signal from every source (Graph mail,
// SharePoint, Monday, HubSpot). Each event is tagged hard or soft and carries
// the resolution attempted against the crosswalks (person / client / project).
// This is additive: the existing calendar->signal path is untouched. Drafting
// these events into work blocks / signals is M2.
//
// Reference records across systems by id, never copy them (§2 principle 2): we
// keep the source id and a raw payload for audit, not a mirror of the record.
// ---------------------------------------------------------------------------

export const activityEvent = pgTable(
  "activity_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entity.id),
    // The resolved actor (crosswalk_person). Null when the actor is unknown.
    personId: uuid("person_id").references(() => resource.id),
    sourceSystem: sourceSystem("source_system").notNull(),
    sourceEventId: text("source_event_id").notNull(),
    eventType: text("event_type").notNull(), // email_sent | monday_status | hubspot_note | ...
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    hardness: eventHardness("hardness").notNull(),
    rawPayload: jsonb("raw_payload"),
    // Resolution attempted at capture time (nullable until/unless it resolves).
    resolvedProjectId: uuid("resolved_project_id").references(() => project.id),
    resolvedClientId: uuid("resolved_client_id").references(() => client.id),
    resolutionConfidence: signalConfidence("resolution_confidence"),
    // Which crosswalk rule fired, for the evidence line (nullable / "none").
    matchedBy: text("matched_by"),
    ...auditColumns(),
  },
  (t) => [
    // Idempotent re-syncs: one event per external id within a system.
    unique("activity_event_source_unique").on(
      t.entityId,
      t.sourceSystem,
      t.sourceEventId,
    ),
  ],
).enableRLS();
