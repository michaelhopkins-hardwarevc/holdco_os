import { pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { auditColumns, partyMatchType, sourceSystem } from "./_shared";
import { entity, organization } from "./core";
import { client, project, resource } from "./phase1";

// ---------------------------------------------------------------------------
// Crosswalks (WIS Day-One Activity Layer §4).
//
// One home per fact: Xero owns money, HubSpot owns customers, Monday owns
// projects, this app owns time. Crosswalks reference those external records by
// ID and map them onto the masters that already live in this repo:
//   plan's `person`  -> resource
//   plan's `party`   -> client
//   plan's `project` -> project (+ the client it belongs to)
//
// They are pure reference data (no money), so reads are membership-scoped and
// writes go through service-role server actions, matching the Signals tables.
// ---------------------------------------------------------------------------

// Maps an external system's user id to a billable resource (the plan's
// crosswalk_person). Lets Capture attribute an event to the right person.
export const crosswalkPerson = pgTable(
  "crosswalk_person",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entity.id),
    sourceSystem: sourceSystem("source_system").notNull(),
    sourceUserId: text("source_user_id").notNull(),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resource.id),
    ...auditColumns(),
  },
  (t) => [
    // One resource per external user id within a system.
    unique("crosswalk_person_source_unique").on(
      t.entityId,
      t.sourceSystem,
      t.sourceUserId,
    ),
  ],
).enableRLS();

// Maps an external counterparty (an email domain or a name variant) to a client
// (the plan's crosswalk_party). hubspot_company_id is the cross-system id back
// to the customer master; we never copy the customer, only reference it.
export const crosswalkParty = pgTable(
  "crosswalk_party",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entity.id),
    matchType: partyMatchType("match_type").notNull(),
    matchValue: text("match_value").notNull(), // normalized domain or name variant
    hubspotCompanyId: text("hubspot_company_id"),
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id),
    ...auditColumns(),
  },
  (t) => [
    // One client per (match type, match value).
    unique("crosswalk_party_match_unique").on(
      t.entityId,
      t.matchType,
      t.matchValue,
    ),
  ],
).enableRLS();

// Maps a project's external footprint (Monday board, SharePoint folder, HubSpot
// deal, Xero tracking option) onto a project and the client it bills to (the
// plan's crosswalk_project). A hard external id here is the strongest project
// signal the resolver can find.
export const crosswalkProject = pgTable(
  "crosswalk_project",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entity.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id),
    mondayBoardId: text("monday_board_id"),
    sharepointFolder: text("sharepoint_folder"),
    hubspotDealId: text("hubspot_deal_id"),
    // The tracking-category option written to Xero on export (M4).
    xeroTrackingOption: text("xero_tracking_option"),
    ...auditColumns(),
  },
  (t) => [
    // One crosswalk row per project.
    unique("crosswalk_project_project_unique").on(t.entityId, t.projectId),
  ],
).enableRLS();
