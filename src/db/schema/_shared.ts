import { pgEnum, timestamp, uuid } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enumerated value sets (spec §6). Adding a value later requires a migration
// (ALTER TYPE ... ADD VALUE), which is fine and explicit.
// ---------------------------------------------------------------------------

export const entityType = pgEnum("entity_type", [
  "services",
  "product",
  "holdco",
  "shared_services",
  "studio",
  "spv",
  "fund",
  "portfolio",
]);

export const membershipRole = pgEnum("membership_role", [
  "owner",
  "admin",
  "manager",
  "staff",
  "viewer",
  "lp",
]);

export const projectType = pgEnum("project_type", [
  "time_materials",
  "fixed_fee",
  "cost_plus",
  "not_to_exceed",
  "internal",
]);

export const projectStatus = pgEnum("project_status", [
  "prospect",
  "active",
  "on_hold",
  "closed",
]);

export const chargeType = pgEnum("charge_type", ["project", "indirect"]);

export const timeEntryStatus = pgEnum("time_entry_status", [
  "draft",
  "submitted",
  "approved",
  "invoiced",
]);

export const expenseStatus = pgEnum("expense_status", [
  "draft",
  "submitted",
  "approved",
  "invoiced",
]);

export const invoiceStatus = pgEnum("invoice_status", [
  "draft",
  "sent",
  "paid",
  "void",
]);

export const invoiceLineSource = pgEnum("invoice_line_source", [
  "time",
  "expense",
  "fixed",
  "manual",
]);

export const indirectCategory = pgEnum("indirect_category", [
  "overhead",
  "pto",
  "holiday",
  "sick",
  "business_dev",
  "training",
  "admin",
  "rnd",
]);

export const vehicleType = pgEnum("vehicle_type", ["spv", "fund"]);

// Signals (timesheet auto-population).
export const signalState = pgEnum("signal_state", [
  "open",
  "accepted",
  "dismissed",
]);

export const signalConfidence = pgEnum("signal_confidence", [
  "high",
  "med",
  "low",
]);

// Crosswalks (WIS Day-One §4). The external systems whose IDs we map onto the
// masters in this app. Xero is a write target, not a signal source, so it is
// not a crosswalk_person source system.
export const sourceSystem = pgEnum("source_system", [
  "microsoft",
  "google",
  "monday",
  "hubspot",
]);

// How a crosswalk_party row matches an external counterparty to a client.
export const partyMatchType = pgEnum("party_match_type", [
  "email_domain",
  "name_variant",
]);

// ---------------------------------------------------------------------------
// Standard audit columns carried by every domain table (CLAUDE.md §5.2).
// Returned from a function so each table gets fresh column builders.
//   - created_at / updated_at: UTC timestamps; updated_at auto-bumps on write.
//   - created_by / updated_by: the acting user (nullable for system/seed rows).
//   - deleted_at: soft-delete marker. Financial records are NEVER hard-deleted.
// ---------------------------------------------------------------------------

export function auditColumns() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  };
}
