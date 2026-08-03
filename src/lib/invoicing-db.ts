import { and, count, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import {
  auditLog,
  expense,
  invoice,
  invoiceLine,
  payment,
  phase,
  project,
  resource,
  timeEntry,
} from "@/db/schema";
import { expenseBillableValue } from "@/lib/expenses";
import { type GroupBy, agingBucket, invoiceNumber } from "@/lib/invoicing";
import type { QueryDb } from "@/lib/queries";
import type { Actor } from "@/lib/timesheet-db";

type Invoice = typeof invoice.$inferSelect;

async function loadInvoice(db: QueryDb, invoiceId: string): Promise<Invoice> {
  const [inv] = await db
    .select()
    .from(invoice)
    .where(eq(invoice.id, invoiceId))
    .limit(1);
  if (!inv) throw new Error("Invoice not found.");
  return inv;
}

function assertDraft(inv: Invoice) {
  if (inv.status !== "draft") {
    throw new Error("Only a draft invoice can be edited. Void it to change a sent invoice.");
  }
}

export async function recomputeInvoiceTotals(
  db: QueryDb,
  invoiceId: string,
): Promise<void> {
  const lines = await db
    .select({ amount: invoiceLine.amount })
    .from(invoiceLine)
    .where(and(eq(invoiceLine.invoiceId, invoiceId), isNull(invoiceLine.deletedAt)));
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const inv = await loadInvoice(db, invoiceId);
  await db
    .update(invoice)
    .set({ subtotal, total: subtotal + inv.tax })
    .where(eq(invoice.id, invoiceId));
}

/**
 * Create a draft invoice from all approved, uninvoiced billable time and
 * billable, uninvoiced expenses for a project in a period. Time is grouped by
 * phase or resource; expenses are one line each. Pulled records flip to
 * 'invoiced' and are linked to the invoice so they can't be double-billed.
 */
export async function generateDraftInvoice(
  db: QueryDb,
  actor: Actor,
  params: {
    entityId: string;
    projectId: string;
    periodStart: string;
    periodEnd: string;
    groupBy: GroupBy;
  },
): Promise<string> {
  const { entityId, projectId, periodStart, periodEnd, groupBy } = params;

  const [proj] = await db
    .select({ id: project.id, clientId: project.clientId })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.entityId, entityId)))
    .limit(1);
  if (!proj) throw new Error("Project not found.");

  const times = await db
    .select({
      id: timeEntry.id,
      hours: timeEntry.hours,
      billableAmount: timeEntry.billableAmount,
      phaseId: timeEntry.phaseId,
      resourceId: timeEntry.resourceId,
      phaseName: phase.name,
      resourceName: resource.name,
    })
    .from(timeEntry)
    .leftJoin(phase, eq(phase.id, timeEntry.phaseId))
    .leftJoin(resource, eq(resource.id, timeEntry.resourceId))
    .where(
      and(
        eq(timeEntry.entityId, entityId),
        eq(timeEntry.projectId, projectId),
        eq(timeEntry.billable, true),
        eq(timeEntry.status, "approved"),
        isNull(timeEntry.invoiceId),
        isNull(timeEntry.deletedAt),
        gte(timeEntry.workDate, periodStart),
        lte(timeEntry.workDate, periodEnd),
      ),
    );

  const exps = await db
    .select({
      id: expense.id,
      amount: expense.amount,
      markupPct: expense.markupPct,
      category: expense.category,
    })
    .from(expense)
    .where(
      and(
        eq(expense.entityId, entityId),
        eq(expense.projectId, projectId),
        eq(expense.billable, true),
        ne(expense.status, "invoiced"),
        isNull(expense.invoiceId),
        isNull(expense.deletedAt),
        gte(expense.expenseDate, periodStart),
        lte(expense.expenseDate, periodEnd),
      ),
    );

  // Group time into lines.
  const groups = new Map<string, { label: string; hours: number; amount: number }>();
  for (const t of times) {
    const key =
      groupBy === "phase" ? (t.phaseId ?? "none") : (t.resourceId ?? "none");
    const label =
      groupBy === "phase"
        ? (t.phaseName ?? "Unphased")
        : (t.resourceName ?? "Resource");
    const g = groups.get(key) ?? { label, hours: 0, amount: 0 };
    g.hours += Number(t.hours);
    g.amount += t.billableAmount;
    groups.set(key, g);
  }

  type NewLine = {
    source: "time" | "expense";
    description: string;
    quantity: number;
    rate: number;
    amount: number;
  };
  const lines: NewLine[] = [];
  for (const g of groups.values()) {
    lines.push({
      source: "time",
      description: `Time · ${g.label}`,
      quantity: g.hours,
      rate: g.hours > 0 ? Math.round(g.amount / g.hours) : 0,
      amount: g.amount,
    });
  }
  for (const e of exps) {
    const value = expenseBillableValue(e.amount, e.markupPct);
    lines.push({
      source: "expense",
      description: `Expense · ${e.category ?? "expense"}`,
      quantity: 1,
      rate: value,
      amount: value,
    });
  }

  if (lines.length === 0) {
    throw new Error(
      "Nothing approved and billable to invoice for this project and period.",
    );
  }

  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const [{ n }] = await db
    .select({ n: count() })
    .from(invoice)
    .where(eq(invoice.entityId, entityId));
  const number = invoiceNumber(n + 1);

  const [inv] = await db
    .insert(invoice)
    .values({
      organizationId: actor.orgId,
      entityId,
      clientId: proj.clientId,
      projectId,
      number,
      status: "draft",
      periodStart,
      periodEnd,
      subtotal,
      tax: 0,
      total: subtotal,
      amountPaid: 0,
      createdBy: actor.actorId,
      updatedBy: actor.actorId,
    })
    .returning({ id: invoice.id });

  await db.insert(invoiceLine).values(
    lines.map((l, i) => ({
      organizationId: actor.orgId,
      entityId,
      invoiceId: inv.id,
      source: l.source,
      description: l.description,
      quantity: l.quantity.toFixed(2),
      rate: l.rate,
      amount: l.amount,
      sortOrder: i,
      createdBy: actor.actorId,
      updatedBy: actor.actorId,
    })),
  );

  const timeIds = times.map((t) => t.id);
  if (timeIds.length) {
    await db
      .update(timeEntry)
      .set({ status: "invoiced", invoiceId: inv.id, updatedBy: actor.actorId })
      .where(inArray(timeEntry.id, timeIds));
  }
  const expIds = exps.map((e) => e.id);
  if (expIds.length) {
    await db
      .update(expense)
      .set({ status: "invoiced", invoiceId: inv.id, updatedBy: actor.actorId })
      .where(inArray(expense.id, expIds));
  }

  return inv.id;
}

export async function addManualLine(
  db: QueryDb,
  actor: Actor,
  invoiceId: string,
  params: { description: string; amount: number; source: "manual" | "fixed" },
): Promise<void> {
  const inv = await loadInvoice(db, invoiceId);
  assertDraft(inv);
  const [{ n }] = await db
    .select({ n: count() })
    .from(invoiceLine)
    .where(eq(invoiceLine.invoiceId, invoiceId));
  await db.insert(invoiceLine).values({
    organizationId: actor.orgId,
    entityId: inv.entityId,
    invoiceId,
    source: params.source,
    description: params.description,
    quantity: "1",
    rate: params.amount,
    amount: params.amount,
    sortOrder: n,
    createdBy: actor.actorId,
    updatedBy: actor.actorId,
  });
  await recomputeInvoiceTotals(db, invoiceId);
}

async function loadEditableLine(db: QueryDb, lineId: string) {
  const [line] = await db
    .select()
    .from(invoiceLine)
    .where(eq(invoiceLine.id, lineId))
    .limit(1);
  if (!line) throw new Error("Line not found.");
  const inv = await loadInvoice(db, line.invoiceId);
  assertDraft(inv);
  if (line.source === "time" || line.source === "expense") {
    throw new Error(
      "Time and expense lines are derived from records; void the invoice to change them.",
    );
  }
  return { line, inv };
}

export async function updateManualLine(
  db: QueryDb,
  actor: Actor,
  lineId: string,
  params: { description: string; amount: number },
): Promise<void> {
  const { line } = await loadEditableLine(db, lineId);
  await db
    .update(invoiceLine)
    .set({
      description: params.description,
      rate: params.amount,
      amount: params.amount,
      updatedBy: actor.actorId,
    })
    .where(eq(invoiceLine.id, line.id));
  await recomputeInvoiceTotals(db, line.invoiceId);
}

export async function deleteManualLine(
  db: QueryDb,
  actor: Actor,
  lineId: string,
): Promise<void> {
  const { line } = await loadEditableLine(db, lineId);
  await db
    .update(invoiceLine)
    .set({ deletedAt: new Date(), updatedBy: actor.actorId })
    .where(eq(invoiceLine.id, line.id));
  await recomputeInvoiceTotals(db, line.invoiceId);
}

export async function markInvoiceSent(
  db: QueryDb,
  actor: Actor,
  invoiceId: string,
  invoiceDate: string,
): Promise<void> {
  const inv = await loadInvoice(db, invoiceId);
  if (inv.status !== "draft") throw new Error("Only a draft invoice can be sent.");
  await db
    .update(invoice)
    .set({ status: "sent", invoiceDate, updatedBy: actor.actorId })
    .where(eq(invoice.id, invoiceId));
  await db.insert(auditLog).values({
    organizationId: actor.orgId,
    entityId: inv.entityId,
    tableName: "invoice",
    recordId: invoiceId,
    action: "send",
    actorId: actor.actorId,
    before: { status: "draft" },
    after: { status: "sent", invoiceDate, total: inv.total },
  });
}

export async function recordPayment(
  db: QueryDb,
  actor: Actor,
  invoiceId: string,
  params: { date: string; amount: number; method: string | null; reference: string | null },
): Promise<void> {
  const inv = await loadInvoice(db, invoiceId);
  if (inv.status !== "sent") {
    throw new Error("Payments can only be recorded on a sent invoice.");
  }
  await db.insert(payment).values({
    organizationId: actor.orgId,
    entityId: inv.entityId,
    invoiceId,
    paymentDate: params.date,
    amount: params.amount,
    method: params.method,
    reference: params.reference,
    createdBy: actor.actorId,
    updatedBy: actor.actorId,
  });
  const amountPaid = inv.amountPaid + params.amount;
  await db
    .update(invoice)
    .set({
      amountPaid,
      status: amountPaid >= inv.total ? "paid" : "sent",
      updatedBy: actor.actorId,
    })
    .where(eq(invoice.id, invoiceId));
  await db.insert(auditLog).values({
    organizationId: actor.orgId,
    entityId: inv.entityId,
    tableName: "payment",
    recordId: invoiceId,
    action: "payment",
    actorId: actor.actorId,
    before: { amountPaid: inv.amountPaid },
    after: { amountPaid, amount: params.amount },
  });
}

/** Void an invoice and release its time/expenses back to WIP. */
export async function voidInvoice(
  db: QueryDb,
  actor: Actor,
  invoiceId: string,
): Promise<void> {
  const inv = await loadInvoice(db, invoiceId);
  if (inv.status === "void") return;
  await db
    .update(timeEntry)
    .set({ status: "approved", invoiceId: null, updatedBy: actor.actorId })
    .where(eq(timeEntry.invoiceId, invoiceId));
  await db
    .update(expense)
    .set({ status: "submitted", invoiceId: null, updatedBy: actor.actorId })
    .where(eq(expense.invoiceId, invoiceId));
  await db
    .update(invoice)
    .set({ status: "void", updatedBy: actor.actorId })
    .where(eq(invoice.id, invoiceId));
  await db.insert(auditLog).values({
    organizationId: actor.orgId,
    entityId: inv.entityId,
    tableName: "invoice",
    recordId: invoiceId,
    action: "void",
    actorId: actor.actorId,
    before: { status: inv.status },
    after: { status: "void" },
  });
}

// --- WIP & AR ---------------------------------------------------------------

export async function computeWip(
  db: QueryDb,
  entityId: string,
): Promise<{ time: number; expense: number; total: number }> {
  const [t] = await db
    .select({
      s: sql<number>`coalesce(sum(${timeEntry.billableAmount}), 0)::int`,
    })
    .from(timeEntry)
    .where(
      and(
        eq(timeEntry.entityId, entityId),
        eq(timeEntry.billable, true),
        eq(timeEntry.status, "approved"),
        isNull(timeEntry.invoiceId),
        isNull(timeEntry.deletedAt),
      ),
    );
  const exps = await db
    .select({ amount: expense.amount, markupPct: expense.markupPct })
    .from(expense)
    .where(
      and(
        eq(expense.entityId, entityId),
        eq(expense.billable, true),
        ne(expense.status, "invoiced"),
        isNull(expense.invoiceId),
        isNull(expense.deletedAt),
      ),
    );
  const expenseVal = exps.reduce(
    (s, e) => s + expenseBillableValue(e.amount, e.markupPct),
    0,
  );
  return { time: t.s, expense: expenseVal, total: t.s + expenseVal };
}

export async function computeArAging(
  db: QueryDb,
  entityId: string,
  asOf: string,
): Promise<{ buckets: Record<string, number>; total: number }> {
  const invs = await db
    .select({
      invoiceDate: invoice.invoiceDate,
      total: invoice.total,
      amountPaid: invoice.amountPaid,
    })
    .from(invoice)
    .where(
      and(
        eq(invoice.entityId, entityId),
        eq(invoice.status, "sent"),
        isNull(invoice.deletedAt),
      ),
    );
  const buckets: Record<string, number> = {
    "0-30": 0,
    "31-60": 0,
    "61-90": 0,
    "90+": 0,
  };
  let total = 0;
  for (const i of invs) {
    const outstanding = i.total - i.amountPaid;
    if (outstanding <= 0) continue;
    const b = agingBucket(i.invoiceDate ?? asOf, asOf);
    buckets[b] += outstanding;
    total += outstanding;
  }
  return { buckets, total };
}
