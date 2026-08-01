import {
  date,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { auditColumns, vehicleType } from "./_shared";
import { entity, organization, user } from "./core";

// ---------------------------------------------------------------------------
// Later-phase scaffolding (spec §6.4).
//
// These tables exist only so the relationships are stable and future
// migrations stay small. They carry minimal columns and NO UI is built for
// them until their phase. Money columns are integer cents like everywhere else.
// ---------------------------------------------------------------------------

// --- Phase 2: QuickBooks + consolidated reporting --------------------------

export const qboConnection = pgTable("qbo_connection", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  entityId: uuid("entity_id")
    .notNull()
    .references(() => entity.id),
  realmId: text("realm_id"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  status: text("status").notNull().default("disconnected"),
  ...auditColumns(),
}).enableRLS();

export const syncMap = pgTable("sync_map", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  entityId: uuid("entity_id").references(() => entity.id),
  localType: text("local_type").notNull(),
  localId: uuid("local_id").notNull(),
  provider: text("provider").notNull(),
  externalId: text("external_id").notNull(),
  ...auditColumns(),
}).enableRLS();

export const allocationRule = pgTable("allocation_rule", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  fromEntityId: uuid("from_entity_id")
    .notNull()
    .references(() => entity.id),
  toEntityId: uuid("to_entity_id")
    .notNull()
    .references(() => entity.id),
  basis: text("basis"),
  pct: numeric("pct", { precision: 6, scale: 3 }),
  driver: text("driver"),
  ...auditColumns(),
}).enableRLS();

export const financialSnapshot = pgTable("financial_snapshot", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  entityId: uuid("entity_id")
    .notNull()
    .references(() => entity.id),
  period: text("period").notNull(),
  account: text("account").notNull(),
  // Cents.
  amount: integer("amount").notNull().default(0),
  ...auditColumns(),
}).enableRLS();

// --- Phase 3: deal & partner pipeline --------------------------------------

export const deal = pgTable("deal", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  targetName: text("target_name").notNull(),
  industry: text("industry"),
  stage: text("stage").notNull().default("sourced"),
  // Cents.
  revenue: integer("revenue"),
  ebitda: integer("ebitda"),
  ownerId: uuid("owner_id").references(() => user.id),
  source: text("source"),
  status: text("status").notNull().default("open"),
  ...auditColumns(),
}).enableRLS();

export const dealActivity = pgTable("deal_activity", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deal.id),
  type: text("type"),
  notes: text("notes"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }),
  ...auditColumns(),
}).enableRLS();

export const diligenceItem = pgTable("diligence_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deal.id),
  label: text("label").notNull(),
  status: text("status").notNull().default("open"),
  ...auditColumns(),
}).enableRLS();

export const partner = pgTable("partner", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  name: text("name").notNull(),
  business: text("business"),
  stage: text("stage"),
  notes: text("notes"),
  ...auditColumns(),
}).enableRLS();

export const integrationTask = pgTable("integration_task", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  entityId: uuid("entity_id").references(() => entity.id),
  label: text("label").notNull(),
  status: text("status").notNull().default("open"),
  ...auditColumns(),
}).enableRLS();

// --- Phase 4: SPV & fund operations ----------------------------------------

export const vehicle = pgTable("vehicle", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  type: vehicleType("type").notNull(),
  name: text("name").notNull(),
  // Cents.
  targetSize: integer("target_size"),
  entityId: uuid("entity_id").references(() => entity.id),
  ...auditColumns(),
}).enableRLS();

export const investor = pgTable("investor", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  name: text("name").notNull(),
  email: text("email"),
  ...auditColumns(),
}).enableRLS();

export const commitment = pgTable("commitment", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicle.id),
  investorId: uuid("investor_id")
    .notNull()
    .references(() => investor.id),
  // Cents.
  amount: integer("amount").notNull().default(0),
  ...auditColumns(),
}).enableRLS();

export const capitalCall = pgTable("capital_call", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicle.id),
  callDate: date("call_date"),
  // Cents.
  amount: integer("amount").notNull().default(0),
  status: text("status").notNull().default("draft"),
  ...auditColumns(),
}).enableRLS();

export const capitalCallLine = pgTable("capital_call_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  capitalCallId: uuid("capital_call_id")
    .notNull()
    .references(() => capitalCall.id),
  commitmentId: uuid("commitment_id")
    .notNull()
    .references(() => commitment.id),
  // Cents.
  amount: integer("amount").notNull().default(0),
  ...auditColumns(),
}).enableRLS();

export const distribution = pgTable("distribution", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicle.id),
  investorId: uuid("investor_id")
    .notNull()
    .references(() => investor.id),
  distributionDate: date("distribution_date"),
  // Cents.
  amount: integer("amount").notNull().default(0),
  ...auditColumns(),
}).enableRLS();

export const spvConnection = pgTable("spv_connection", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicle.id),
  provider: text("provider"),
  externalId: text("external_id"),
  status: text("status").notNull().default("disconnected"),
  ...auditColumns(),
}).enableRLS();

// --- Phase 5: cap table & QSBS view ----------------------------------------

export const securityClass = pgTable("security_class", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  entityId: uuid("entity_id")
    .notNull()
    .references(() => entity.id),
  name: text("name").notNull(),
  ...auditColumns(),
}).enableRLS();

export const holding = pgTable("holding", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  entityId: uuid("entity_id")
    .notNull()
    .references(() => entity.id),
  holder: text("holder").notNull(),
  securityClassId: uuid("security_class_id").references(() => securityClass.id),
  units: numeric("units", { precision: 20, scale: 4 }),
  ...auditColumns(),
}).enableRLS();

export const beneficiary = pgTable("beneficiary", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  holder: text("holder"),
  name: text("name").notNull(),
  relationship: text("relationship"),
  ...auditColumns(),
}).enableRLS();

export const qsbsLot = pgTable("qsbs_lot", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  entityId: uuid("entity_id")
    .notNull()
    .references(() => entity.id),
  holder: text("holder"),
  acquiredDate: date("acquired_date"),
  // Cents.
  basis: integer("basis"),
  eligibleDate: date("eligible_date"),
  ...auditColumns(),
}).enableRLS();
