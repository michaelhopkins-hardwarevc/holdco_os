import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  ne,
  notInArray,
  type ExtractTablesWithRelations,
} from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  client,
  contact,
  expense,
  indirectCode,
  invoice,
  invoiceLine,
  membership,
  payment,
  phase,
  project,
  resource,
  signal,
  signalRule,
  timeEntry,
  user,
} from "@/db/schema";

type FullSchema = typeof import("@/db/schema");

// A drizzle db or transaction that can run reads against our schema. Reads are
// meant to run inside runWithUser() so RLS scopes them by membership; the
// explicit entityId filters then narrow to the active entity.
export type QueryDb = PgDatabase<
  PgQueryResultHKT,
  FullSchema,
  ExtractTablesWithRelations<FullSchema>
>;

export function listClients(db: QueryDb, entityId: string) {
  return db
    .select()
    .from(client)
    .where(and(eq(client.entityId, entityId), isNull(client.deletedAt)))
    .orderBy(asc(client.name));
}

export function getClient(db: QueryDb, entityId: string, clientId: string) {
  return db
    .select()
    .from(client)
    .where(
      and(
        eq(client.id, clientId),
        eq(client.entityId, entityId),
        isNull(client.deletedAt),
      ),
    )
    .limit(1);
}

export function listContacts(db: QueryDb, entityId: string, clientId: string) {
  return db
    .select()
    .from(contact)
    .where(
      and(
        eq(contact.entityId, entityId),
        eq(contact.clientId, clientId),
        isNull(contact.deletedAt),
      ),
    )
    .orderBy(asc(contact.name));
}

export function listProjects(db: QueryDb, entityId: string) {
  return db
    .select({
      id: project.id,
      code: project.code,
      name: project.name,
      type: project.type,
      status: project.status,
      contractValue: project.contractValue,
      clientName: client.name,
    })
    .from(project)
    .innerJoin(client, eq(client.id, project.clientId))
    .where(and(eq(project.entityId, entityId), isNull(project.deletedAt)))
    .orderBy(asc(project.code));
}

export function getProject(db: QueryDb, entityId: string, projectId: string) {
  return db
    .select()
    .from(project)
    .where(
      and(
        eq(project.id, projectId),
        eq(project.entityId, entityId),
        isNull(project.deletedAt),
      ),
    )
    .limit(1);
}

export function listPhases(db: QueryDb, entityId: string, projectId: string) {
  return db
    .select()
    .from(phase)
    .where(
      and(
        eq(phase.entityId, entityId),
        eq(phase.projectId, projectId),
        isNull(phase.deletedAt),
      ),
    )
    .orderBy(asc(phase.sortOrder));
}

export function listEntityPhases(db: QueryDb, entityId: string) {
  return db
    .select({ id: phase.id, projectId: phase.projectId, name: phase.name })
    .from(phase)
    .where(and(eq(phase.entityId, entityId), isNull(phase.deletedAt)))
    .orderBy(asc(phase.sortOrder));
}

export function listResources(
  db: QueryDb,
  entityId: string,
  opts?: { activeOnly?: boolean },
) {
  return db
    .select()
    .from(resource)
    .where(
      and(
        eq(resource.entityId, entityId),
        isNull(resource.deletedAt),
        opts?.activeOnly ? eq(resource.status, "active") : undefined,
      ),
    )
    .orderBy(asc(resource.name));
}

export function getResource(db: QueryDb, entityId: string, resourceId: string) {
  return db
    .select()
    .from(resource)
    .where(
      and(
        eq(resource.id, resourceId),
        eq(resource.entityId, entityId),
        isNull(resource.deletedAt),
      ),
    )
    .limit(1);
}

export function listIndirectCodes(
  db: QueryDb,
  entityId: string,
  opts?: { activeOnly?: boolean },
) {
  return db
    .select()
    .from(indirectCode)
    .where(
      and(
        eq(indirectCode.entityId, entityId),
        isNull(indirectCode.deletedAt),
        opts?.activeOnly ? eq(indirectCode.active, true) : undefined,
      ),
    )
    .orderBy(asc(indirectCode.code));
}

export function listEntityMembers(db: QueryDb, entityId: string) {
  return db
    .select({ userId: user.id, name: user.name })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(and(eq(membership.entityId, entityId), isNull(membership.deletedAt)))
    .orderBy(asc(user.name));
}

export function getIndirectCode(db: QueryDb, entityId: string, codeId: string) {
  return db
    .select()
    .from(indirectCode)
    .where(
      and(
        eq(indirectCode.id, codeId),
        eq(indirectCode.entityId, entityId),
        isNull(indirectCode.deletedAt),
      ),
    )
    .limit(1);
}

// --- Expenses (spec §7.4) ---------------------------------------------------

export function listExpenses(db: QueryDb, entityId: string) {
  return db
    .select({
      id: expense.id,
      expenseDate: expense.expenseDate,
      category: expense.category,
      amount: expense.amount,
      billable: expense.billable,
      markupPct: expense.markupPct,
      status: expense.status,
      receiptUrl: expense.receiptUrl,
      projectCode: project.code,
      projectName: project.name,
    })
    .from(expense)
    .leftJoin(project, eq(project.id, expense.projectId))
    .where(and(eq(expense.entityId, entityId), isNull(expense.deletedAt)))
    .orderBy(desc(expense.expenseDate));
}

/** Billable, not-yet-invoiced expenses available to invoicing (spec §7.4 AC).
 *  Non-billable expenses are excluded by construction. */
export function listInvoiceableExpenses(
  db: QueryDb,
  entityId: string,
  projectId?: string,
) {
  return db
    .select()
    .from(expense)
    .where(
      and(
        eq(expense.entityId, entityId),
        eq(expense.billable, true),
        notInArray(expense.status, ["invoiced"]),
        isNull(expense.deletedAt),
        projectId ? eq(expense.projectId, projectId) : undefined,
      ),
    )
    .orderBy(desc(expense.expenseDate));
}

// --- Invoicing (spec §7.5) --------------------------------------------------

export function listInvoices(db: QueryDb, entityId: string) {
  return db
    .select({
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      invoiceDate: invoice.invoiceDate,
      total: invoice.total,
      amountPaid: invoice.amountPaid,
      clientName: client.name,
      projectCode: project.code,
    })
    .from(invoice)
    .leftJoin(client, eq(client.id, invoice.clientId))
    .leftJoin(project, eq(project.id, invoice.projectId))
    .where(and(eq(invoice.entityId, entityId), isNull(invoice.deletedAt)))
    .orderBy(desc(invoice.number));
}

export function getInvoice(db: QueryDb, entityId: string, invoiceId: string) {
  return db
    .select({
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      invoiceDate: invoice.invoiceDate,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      subtotal: invoice.subtotal,
      tax: invoice.tax,
      total: invoice.total,
      amountPaid: invoice.amountPaid,
      terms: invoice.terms,
      pdfUrl: invoice.pdfUrl,
      clientName: client.name,
      projectCode: project.code,
      projectName: project.name,
    })
    .from(invoice)
    .leftJoin(client, eq(client.id, invoice.clientId))
    .leftJoin(project, eq(project.id, invoice.projectId))
    .where(and(eq(invoice.id, invoiceId), eq(invoice.entityId, entityId)))
    .limit(1);
}

export function listInvoiceLines(db: QueryDb, invoiceId: string) {
  return db
    .select()
    .from(invoiceLine)
    .where(and(eq(invoiceLine.invoiceId, invoiceId), isNull(invoiceLine.deletedAt)))
    .orderBy(asc(invoiceLine.sortOrder));
}

export function listPayments(db: QueryDb, invoiceId: string) {
  return db
    .select()
    .from(payment)
    .where(and(eq(payment.invoiceId, invoiceId), isNull(payment.deletedAt)))
    .orderBy(asc(payment.paymentDate));
}

// --- Timesheet (spec §7.3) --------------------------------------------------

/** The billable resource linked to a user in an entity (for their timesheet). */
export function getResourceForUser(
  db: QueryDb,
  entityId: string,
  userId: string,
) {
  return db
    .select()
    .from(resource)
    .where(
      and(
        eq(resource.entityId, entityId),
        eq(resource.userId, userId),
        isNull(resource.deletedAt),
      ),
    )
    .limit(1);
}

/** All non-deleted time entries for a resource within a date range, with the
 *  labels needed to render grid rows. */
export function getWeekEntries(
  db: QueryDb,
  entityId: string,
  resourceId: string,
  start: string,
  end: string,
) {
  return db
    .select({
      id: timeEntry.id,
      workDate: timeEntry.workDate,
      hours: timeEntry.hours,
      chargeType: timeEntry.chargeType,
      projectId: timeEntry.projectId,
      phaseId: timeEntry.phaseId,
      indirectCodeId: timeEntry.indirectCodeId,
      billable: timeEntry.billable,
      billRate: timeEntry.billRate,
      costRate: timeEntry.costRate,
      billableAmount: timeEntry.billableAmount,
      costAmount: timeEntry.costAmount,
      status: timeEntry.status,
      projectCode: project.code,
      phaseName: phase.name,
      indirectCodeLabel: indirectCode.code,
    })
    .from(timeEntry)
    .leftJoin(project, eq(project.id, timeEntry.projectId))
    .leftJoin(phase, eq(phase.id, timeEntry.phaseId))
    .leftJoin(indirectCode, eq(indirectCode.id, timeEntry.indirectCodeId))
    .where(
      and(
        eq(timeEntry.entityId, entityId),
        eq(timeEntry.resourceId, resourceId),
        gte(timeEntry.workDate, start),
        lte(timeEntry.workDate, end),
        isNull(timeEntry.deletedAt),
      ),
    );
}

/** Open signals for a resource within a date range, with charge labels. */
export function listOpenSignals(
  db: QueryDb,
  entityId: string,
  resourceId: string,
  start: string,
  end: string,
) {
  return db
    .select({
      id: signal.id,
      workDate: signal.workDate,
      provider: signal.provider,
      sharedId: signal.sharedId,
      evidence: signal.evidence,
      provenance: signal.provenance,
      chargeType: signal.chargeType,
      projectId: signal.projectId,
      phaseId: signal.phaseId,
      indirectCodeId: signal.indirectCodeId,
      proposedHours: signal.proposedHours,
      confidence: signal.confidence,
      projectCode: project.code,
      phaseName: phase.name,
      indirectCodeLabel: indirectCode.code,
    })
    .from(signal)
    .leftJoin(project, eq(project.id, signal.projectId))
    .leftJoin(phase, eq(phase.id, signal.phaseId))
    .leftJoin(indirectCode, eq(indirectCode.id, signal.indirectCodeId))
    .where(
      and(
        eq(signal.entityId, entityId),
        eq(signal.resourceId, resourceId),
        eq(signal.state, "open"),
        gte(signal.workDate, start),
        lte(signal.workDate, end),
        isNull(signal.deletedAt),
      ),
    )
    .orderBy(asc(signal.workDate));
}

/**
 * How OTHER resources charged the same meetings (matched by shared_id), from
 * signals they already accepted. Feeds the consistency nudge (Signals step 3).
 */
export function listPeerChargesForSharedIds(
  db: QueryDb,
  entityId: string,
  excludeResourceId: string,
  sharedIds: string[],
) {
  return db
    .select({
      sharedId: signal.sharedId,
      resourceId: signal.resourceId,
      chargeType: signal.chargeType,
      projectId: signal.projectId,
      phaseId: signal.phaseId,
      indirectCodeId: signal.indirectCodeId,
      projectCode: project.code,
      phaseName: phase.name,
      indirectCodeLabel: indirectCode.code,
    })
    .from(signal)
    .leftJoin(project, eq(project.id, signal.projectId))
    .leftJoin(phase, eq(phase.id, signal.phaseId))
    .leftJoin(indirectCode, eq(indirectCode.id, signal.indirectCodeId))
    .where(
      and(
        eq(signal.entityId, entityId),
        eq(signal.state, "accepted"),
        ne(signal.resourceId, excludeResourceId),
        inArray(signal.sharedId, sharedIds),
        isNull(signal.deletedAt),
      ),
    );
}

/** Learned signal rules for a resource, with charge labels for display. */
export function listSignalRules(
  db: QueryDb,
  entityId: string,
  resourceId: string,
) {
  return db
    .select({
      id: signalRule.id,
      matchValue: signalRule.matchValue,
      chargeType: signalRule.chargeType,
      projectId: signalRule.projectId,
      phaseId: signalRule.phaseId,
      indirectCodeId: signalRule.indirectCodeId,
      hitCount: signalRule.hitCount,
      projectCode: project.code,
      phaseName: phase.name,
      indirectCodeLabel: indirectCode.code,
    })
    .from(signalRule)
    .leftJoin(project, eq(project.id, signalRule.projectId))
    .leftJoin(phase, eq(phase.id, signalRule.phaseId))
    .leftJoin(indirectCode, eq(indirectCode.id, signalRule.indirectCodeId))
    .where(
      and(
        eq(signalRule.entityId, entityId),
        eq(signalRule.resourceId, resourceId),
        isNull(signalRule.deletedAt),
      ),
    )
    .orderBy(asc(signalRule.matchValue));
}

/** Submitted time entries across the entity (for the approvals queue). */
export function listSubmittedEntries(db: QueryDb, entityId: string) {
  return db
    .select({
      resourceId: timeEntry.resourceId,
      resourceName: resource.name,
      workDate: timeEntry.workDate,
      hours: timeEntry.hours,
    })
    .from(timeEntry)
    .innerJoin(resource, eq(resource.id, timeEntry.resourceId))
    .where(
      and(
        eq(timeEntry.entityId, entityId),
        eq(timeEntry.status, "submitted"),
        isNull(timeEntry.deletedAt),
      ),
    );
}

/** All time entries for an entity, flattened for CSV export (spec §7.7). */
export function listTimeEntries(db: QueryDb, entityId: string) {
  return db
    .select({
      workDate: timeEntry.workDate,
      resourceName: resource.name,
      chargeType: timeEntry.chargeType,
      projectCode: project.code,
      phaseName: phase.name,
      indirectCode: indirectCode.code,
      hours: timeEntry.hours,
      billable: timeEntry.billable,
      billRate: timeEntry.billRate,
      billableAmount: timeEntry.billableAmount,
      costAmount: timeEntry.costAmount,
      status: timeEntry.status,
      notes: timeEntry.notes,
    })
    .from(timeEntry)
    .innerJoin(resource, eq(resource.id, timeEntry.resourceId))
    .leftJoin(project, eq(project.id, timeEntry.projectId))
    .leftJoin(phase, eq(phase.id, timeEntry.phaseId))
    .leftJoin(indirectCode, eq(indirectCode.id, timeEntry.indirectCodeId))
    .where(and(eq(timeEntry.entityId, entityId), isNull(timeEntry.deletedAt)))
    .orderBy(desc(timeEntry.workDate));
}

// --- Pure budget math (spec §7.2: project page shows a budget summary) -------

export type PhaseBudget = {
  budgetHours: string | null;
  budgetAmount: number | null;
};

export function summarizePhases(phases: PhaseBudget[]): {
  totalHours: number;
  totalAmount: number;
} {
  let totalHours = 0;
  let totalAmount = 0;
  for (const p of phases) {
    if (p.budgetHours) totalHours += Number(p.budgetHours);
    if (p.budgetAmount) totalAmount += p.budgetAmount;
  }
  return { totalHours, totalAmount };
}
