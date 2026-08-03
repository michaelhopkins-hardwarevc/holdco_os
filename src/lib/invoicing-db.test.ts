// @vitest-environment node
import { and, eq, isNull, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  client,
  entity,
  expense,
  invoice,
  invoiceLine,
  organization,
  phase,
  project,
  resource,
  timeEntry,
} from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-helpers";
import {
  computeArAging,
  computeWip,
  generateDraftInvoice,
  markInvoiceSent,
  recordPayment,
  voidInvoice,
} from "@/lib/invoicing-db";

let pg: TestDb["pg"];
let db: TestDb["db"];
beforeEach(async () => {
  ({ pg, db } = await createTestDb());
});
afterEach(async () => {
  await pg.close();
});

const PERIOD = { start: "2026-07-01", end: "2026-07-31" };

async function setup() {
  const [org] = await db.insert(organization).values({ name: "O", slug: "o" }).returning();
  const [ent] = await db
    .insert(entity)
    .values({ organizationId: org.id, name: "E", type: "services" })
    .returning();
  const [cli] = await db
    .insert(client)
    .values({ organizationId: org.id, entityId: ent.id, name: "Acme" })
    .returning();
  const [proj] = await db
    .insert(project)
    .values({
      organizationId: org.id,
      entityId: ent.id,
      clientId: cli.id,
      code: "P1",
      name: "Proj",
      type: "time_materials",
    })
    .returning();
  const [phA] = await db
    .insert(phase)
    .values({ organizationId: org.id, entityId: ent.id, projectId: proj.id, name: "Design" })
    .returning();
  const [phB] = await db
    .insert(phase)
    .values({ organizationId: org.id, entityId: ent.id, projectId: proj.id, name: "Build" })
    .returning();
  const [r1] = await db
    .insert(resource)
    .values({ organizationId: org.id, entityId: ent.id, name: "R1", billRate: 22500 })
    .returning();
  const [r2] = await db
    .insert(resource)
    .values({ organizationId: org.id, entityId: ent.id, name: "R2", billRate: 20000 })
    .returning();

  const time = (over: Partial<typeof timeEntry.$inferInsert>) =>
    db.insert(timeEntry).values({
      organizationId: org.id,
      entityId: ent.id,
      resourceId: r1.id,
      workDate: "2026-07-15",
      chargeType: "project",
      projectId: proj.id,
      phaseId: phA.id,
      hours: "8.00",
      billable: true,
      billRate: 22500,
      costRate: 9000,
      billableAmount: 180000,
      costAmount: 72000,
      status: "approved",
      ...over,
    });

  // Invoiceable: phase A (180000 + 45000) + phase B (100000) = 325000.
  await time({ hours: "8.00", billableAmount: 180000 });
  await time({ hours: "2.00", billableAmount: 45000 });
  await time({ resourceId: r2.id, phaseId: phB.id, hours: "5.00", billableAmount: 100000 });
  // Excluded: not approved, and non-billable.
  await time({ status: "submitted", billableAmount: 99999 });
  await time({ billable: false, billableAmount: 0 });

  // Billable expense 100.00 + 10% markup = 110.00 (11000c). Non-billable excluded.
  await db.insert(expense).values({
    organizationId: org.id,
    entityId: ent.id,
    resourceId: r1.id,
    projectId: proj.id,
    expenseDate: "2026-07-10",
    category: "travel",
    amount: 10000,
    billable: true,
    markupPct: "10",
    status: "submitted",
  });
  await db.insert(expense).values({
    organizationId: org.id,
    entityId: ent.id,
    resourceId: r1.id,
    projectId: proj.id,
    expenseDate: "2026-07-10",
    category: "meals",
    amount: 5000,
    billable: false,
    status: "submitted",
  });

  return {
    actor: { orgId: org.id, actorId: r1.id },
    entityId: ent.id,
    projectId: proj.id,
  };
}

// Sum of billable_amount of the time entries linked to an invoice.
async function invoicedTimeTotal(invoiceId: string): Promise<number> {
  const [row] = await db
    .select({ s: sql<number>`coalesce(sum(${timeEntry.billableAmount}),0)::int` })
    .from(timeEntry)
    .where(eq(timeEntry.invoiceId, invoiceId));
  return row.s;
}

describe("invoice generation + reconciliation", () => {
  it("ties invoice, lines, WIP, AR, and payments to the underlying records", async () => {
    const s = await setup();

    // WIP before = 325000 (time) + 11000 (expense) = 336000.
    const wipBefore = await computeWip(db, s.entityId);
    expect(wipBefore.total).toBe(336000);

    const invId = await generateDraftInvoice(db, s.actor, {
      entityId: s.entityId,
      projectId: s.projectId,
      periodStart: PERIOD.start,
      periodEnd: PERIOD.end,
      groupBy: "phase",
    });

    const [inv] = await db.select().from(invoice).where(eq(invoice.id, invId));
    const lines = await db
      .select()
      .from(invoiceLine)
      .where(and(eq(invoiceLine.invoiceId, invId), isNull(invoiceLine.deletedAt)));

    // Reconcile: sum(lines) == invoice subtotal == total.
    const lineSum = lines.reduce((a, l) => a + l.amount, 0);
    expect(lineSum).toBe(inv.subtotal);
    expect(inv.subtotal).toBe(inv.total);
    expect(inv.total).toBe(336000);

    // Reconcile invoice to underlying records: invoiced time + expense value.
    const timeTotal = await invoicedTimeTotal(invId);
    expect(timeTotal).toBe(325000);
    expect(inv.total).toBe(timeTotal + 11000);

    // Grouped by phase -> 2 time lines + 1 expense line.
    expect(lines.filter((l) => l.source === "time")).toHaveLength(2);
    expect(lines.filter((l) => l.source === "expense")).toHaveLength(1);

    // Pulled time is now invoiced; WIP drops to 0.
    const wipAfter = await computeWip(db, s.entityId);
    expect(wipAfter.total).toBe(0);

    // Cannot double-bill: nothing left to invoice.
    await expect(
      generateDraftInvoice(db, s.actor, {
        entityId: s.entityId,
        projectId: s.projectId,
        periodStart: PERIOD.start,
        periodEnd: PERIOD.end,
        groupBy: "phase",
      }),
    ).rejects.toThrow();

    // DB guard: an invoiced time entry can't be re-billed.
    const [anInvoiced] = await db
      .select({ id: timeEntry.id })
      .from(timeEntry)
      .where(eq(timeEntry.invoiceId, invId))
      .limit(1);
    await expect(
      db.update(timeEntry).set({ hours: "99.00" }).where(eq(timeEntry.id, anInvoiced.id)),
    ).rejects.toThrow();

    // Send -> AR = total in the 0-30 bucket.
    await markInvoiceSent(db, s.actor, invId, "2026-08-01");
    let ar = await computeArAging(db, s.entityId, "2026-08-10");
    expect(ar.total).toBe(336000);
    expect(ar.buckets["0-30"]).toBe(336000);

    // Partial payment -> AR reduces, still sent.
    await recordPayment(db, s.actor, invId, { date: "2026-08-05", amount: 100000, method: "ach", reference: null });
    ar = await computeArAging(db, s.entityId, "2026-08-10");
    expect(ar.total).toBe(236000);

    // Pay the rest -> paid, out of AR.
    await recordPayment(db, s.actor, invId, { date: "2026-08-09", amount: 236000, method: "ach", reference: null });
    const [paid] = await db.select().from(invoice).where(eq(invoice.id, invId));
    expect(paid.status).toBe("paid");
    expect(paid.amountPaid).toBe(336000);
    ar = await computeArAging(db, s.entityId, "2026-08-10");
    expect(ar.total).toBe(0);
  });

  it("voiding releases time/expenses back to WIP", async () => {
    const s = await setup();
    const invId = await generateDraftInvoice(db, s.actor, {
      entityId: s.entityId,
      projectId: s.projectId,
      periodStart: PERIOD.start,
      periodEnd: PERIOD.end,
      groupBy: "resource",
    });
    expect((await computeWip(db, s.entityId)).total).toBe(0);

    await voidInvoice(db, s.actor, invId);
    const [voided] = await db.select().from(invoice).where(eq(invoice.id, invId));
    expect(voided.status).toBe("void");
    // Time is back to approved and re-enters WIP.
    expect((await computeWip(db, s.entityId)).total).toBe(336000);
  });
});
