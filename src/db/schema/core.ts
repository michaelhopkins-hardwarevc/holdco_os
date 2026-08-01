import {
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { auditColumns, entityType, membershipRole } from "./_shared";

// ---------------------------------------------------------------------------
// Core / identity (spec §6.1)
// ---------------------------------------------------------------------------

// The future multi-tenant boundary. Single row for now (spec principle §6).
export const organization = pgTable("organization", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ...auditColumns(),
}).enableRLS();

// A person who can log in. Users are cross-entity within an organization;
// their access to a given entity is granted through `membership`.
export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  // Supabase Auth user id (set once auth is wired in §7.1).
  authId: uuid("auth_id").unique(),
  ...auditColumns(),
}).enableRLS();

// A legal company in the portfolio.
export const entity = pgTable("entity", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  type: entityType("type").notNull(),
  status: text("status").notNull().default("active"),
  baseCurrency: text("base_currency").notNull().default("USD"),
  // FK added when qbo_connection gains real columns in Phase 2 (kept loose to
  // avoid a cross-phase circular reference).
  qboConnectionId: uuid("qbo_connection_id"),
  ...auditColumns(),
}).enableRLS();

// Links a user to an entity with a role. A user can belong to many entities
// with different roles.
export const membership = pgTable(
  "membership",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entity.id),
    role: membershipRole("role").notNull(),
    ...auditColumns(),
  },
  (t) => [unique("membership_user_entity_unique").on(t.userId, t.entityId)],
).enableRLS();

// Append-only trail of mutations to financial records (CLAUDE.md security
// rules / spec §9). Written by the app on create/update/delete.
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  entityId: uuid("entity_id").references(() => entity.id),
  tableName: text("table_name").notNull(),
  recordId: uuid("record_id").notNull(),
  action: text("action").notNull(), // insert | update | delete
  actorId: uuid("actor_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();
