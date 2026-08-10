import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  numeric,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  auditColumns,
  chargeType,
  expenseStatus,
  indirectCategory,
  invoiceLineSource,
  invoiceStatus,
  projectStatus,
  projectType,
  timeEntryStatus,
} from "./_shared";
import { entity, organization, user } from "./core";

// ---------------------------------------------------------------------------
// Clients & projects (spec §6.2)
//
// NOTE ON MONEY: every monetary column is an INTEGER number of cents
// (CLAUDE.md). Never store dollars as floats. Rates are cents-per-hour.
// Hours / percentages are `numeric` (exact decimal), not money.
// ---------------------------------------------------------------------------

export const client = pgTable("client", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  entityId: uuid("entity_id")
    .notNull()
    .references(() => entity.id),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  billingTerms: text("billing_terms"),
  address: text("address"),
  notes: text("notes"),
  ...auditColumns(),
}).enableRLS();

export const contact = pgTable("contact", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  entityId: uuid("entity_id")
    .notNull()
    .references(() => entity.id),
  clientId: uuid("client_id")
    .notNull()
    .references(() => client.id),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: text("role"),
  ...auditColumns(),
}).enableRLS();

export const project = pgTable(
  "project",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entity.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: projectType("type").notNull(),
    status: projectStatus("status").notNull().default("active"),
    // Contract value in cents (nullable for T&M projects).
    contractValue: integer("contract_value"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    projectManagerId: uuid("project_manager_id").references(() => user.id),
    notes: text("notes"),
    ...auditColumns(),
  },
  (t) => [unique("project_entity_code_unique").on(t.entityId, t.code)],
).enableRLS();

export const phase = pgTable("phase", {
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
  name: text("name").notNull(),
  code: text("code"),
  budgetHours: numeric("budget_hours", { precision: 10, scale: 2 }),
  // Phase budget in cents.
  budgetAmount: integer("budget_amount"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...auditColumns(),
}).enableRLS();

// ---------------------------------------------------------------------------
// People, time & billing (spec §6.3)
// ---------------------------------------------------------------------------

// A billable person. May or may not map to a login `user`.
export const resource = pgTable("resource", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  entityId: uuid("entity_id")
    .notNull()
    .references(() => entity.id),
  userId: uuid("user_id").references(() => user.id),
  name: text("name").notNull(),
  title: text("title"),
  // Cents per hour.
  billRate: integer("bill_rate").notNull().default(0),
  costRate: integer("cost_rate").notNull().default(0),
  // Percent, e.g. 75.00.
  targetUtilization: numeric("target_utilization", { precision: 5, scale: 2 }),
  status: text("status").notNull().default("active"),
  ...auditColumns(),
}).enableRLS();

// Optional per-project or per-role rate override (cents per hour).
export const rateOverride = pgTable("rate_override", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  entityId: uuid("entity_id")
    .notNull()
    .references(() => entity.id),
  projectId: uuid("project_id").references(() => project.id),
  resourceId: uuid("resource_id").references(() => resource.id),
  role: text("role"),
  billRate: integer("bill_rate").notNull(),
  effectiveDate: date("effective_date"),
  ...auditColumns(),
}).enableRLS();

// Non-billable time bucket (overhead, PTO, BD, admin, R&D, ...).
export const indirectCode = pgTable(
  "indirect_code",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entity.id),
    code: text("code").notNull(),
    category: indirectCategory("category").notNull(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    ...auditColumns(),
  },
  (t) => [unique("indirect_code_entity_code_unique").on(t.entityId, t.code)],
).enableRLS();

export const timeEntry = pgTable(
  "time_entry",
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
    workDate: date("work_date").notNull(),
    chargeType: chargeType("charge_type").notNull(),
    projectId: uuid("project_id").references(() => project.id),
    phaseId: uuid("phase_id").references(() => phase.id),
    indirectCodeId: uuid("indirect_code_id").references(() => indirectCode.id),
    hours: numeric("hours", { precision: 6, scale: 2 }).notNull(),
    billable: boolean("billable").notNull().default(false),
    // All cents.
    billRate: integer("bill_rate").notNull().default(0),
    costRate: integer("cost_rate").notNull().default(0),
    billableAmount: integer("billable_amount").notNull().default(0),
    costAmount: integer("cost_amount").notNull().default(0),
    notes: text("notes"),
    status: timeEntryStatus("status").notNull().default("draft"),
    // Set when this entry is pulled onto an invoice (protects against re-billing).
    invoiceId: uuid("invoice_id"),
    ...auditColumns(),
  },
  (t) => [
    // Exactly one of project_id / indirect_code_id is set (CLAUDE.md).
    check(
      "time_entry_exactly_one_charge",
      sql`(${t.projectId} is not null)::int + (${t.indirectCodeId} is not null)::int = 1`,
    ),
    // Indirect time never produces a billable amount (spec §7.3 AC).
    check(
      "time_entry_indirect_not_billable",
      sql`${t.indirectCodeId} is null or (${t.billable} = false and ${t.billableAmount} = 0)`,
    ),
    // A phase only applies to project time.
    check(
      "time_entry_phase_requires_project",
      sql`${t.phaseId} is null or ${t.projectId} is not null`,
    ),
    check("time_entry_hours_nonneg", sql`${t.hours} >= 0`),
  ],
).enableRLS();

export const expense = pgTable("expense", {
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
  projectId: uuid("project_id").references(() => project.id),
  expenseDate: date("expense_date").notNull(),
  category: text("category"),
  // Cents.
  amount: integer("amount").notNull().default(0),
  billable: boolean("billable").notNull().default(false),
  // Percent markup on billable expenses, e.g. 10.00.
  markupPct: numeric("markup_pct", { precision: 5, scale: 2 })
    .notNull()
    .default("0"),
  receiptUrl: text("receipt_url"),
  status: expenseStatus("status").notNull().default("draft"),
  invoiceId: uuid("invoice_id"),
  ...auditColumns(),
}).enableRLS();

// ---------------------------------------------------------------------------
// Invoicing, WIP & AR (spec §6.3 / §7.5)
// ---------------------------------------------------------------------------

export const invoice = pgTable(
  "invoice",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entity.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id),
    projectId: uuid("project_id").references(() => project.id),
    number: text("number").notNull(),
    invoiceDate: date("invoice_date"),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    status: invoiceStatus("status").notNull().default("draft"),
    // All cents.
    subtotal: integer("subtotal").notNull().default(0),
    tax: integer("tax").notNull().default(0),
    total: integer("total").notNull().default(0),
    amountPaid: integer("amount_paid").notNull().default(0),
    terms: text("terms"),
    qboId: text("qbo_id"),
    // Xero draft-invoice export (WIS M4). Set once pushed; the Xero draft awaits
    // human approval and sending in Xero.
    xeroInvoiceId: text("xero_invoice_id"),
    xeroStatus: text("xero_status"),
    pdfUrl: text("pdf_url"),
    ...auditColumns(),
  },
  (t) => [unique("invoice_entity_number_unique").on(t.entityId, t.number)],
).enableRLS();

export const invoiceLine = pgTable("invoice_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  entityId: uuid("entity_id")
    .notNull()
    .references(() => entity.id),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoice.id),
  source: invoiceLineSource("source").notNull(),
  // Points back to the time_entry / expense row it was billed from (nullable).
  sourceId: uuid("source_id"),
  description: text("description"),
  quantity: numeric("quantity", { precision: 12, scale: 2 })
    .notNull()
    .default("1"),
  // Cents.
  rate: integer("rate").notNull().default(0),
  amount: integer("amount").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  ...auditColumns(),
}).enableRLS();

export const payment = pgTable("payment", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  entityId: uuid("entity_id")
    .notNull()
    .references(() => entity.id),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoice.id),
  paymentDate: date("payment_date").notNull(),
  // Cents.
  amount: integer("amount").notNull().default(0),
  method: text("method"),
  reference: text("reference"),
  ...auditColumns(),
}).enableRLS();
