// @vitest-environment node
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  client,
  entity,
  expense,
  indirectCode,
  organization,
  phase,
  project,
  resource,
  timeEntry,
} from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-helpers";
import {
  computeWip,
  generateDraftInvoice,
  markInvoiceSent,
} from "@/lib/invoicing-db";
import {
  firmDashboard,
  projectProfitability,
  utilizationByResource,
} from "@/lib/reports-db";

let pg: TestDb["pg"];
let db: TestDb["db"];
beforeEach(async () => {
  ({ pg, db } = await createTestDb());
});
afterEach(async () => {
  await pg.close();
});

const RANGE = { from: "2026-07-01", to: "2026-07-31" };

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
      type: "fixed_fee",
      contractValue: 500000,
    })
    .returning();
  const [phA] = await db
    .insert(phase)
    .values({
      organizationId: org.id,
      entityId: ent.id,
      projectId: proj.id,
      name: "Design",
      budgetHours: "20",
      budgetAmount: 300000,
      sortOrder: 0,
    })
    .returning();
  const [phB] = await db
    .insert(phase)
    .values({
      organizationId: org.id,
      entityId: ent.id,
      projectId: proj.id,
      name: "Build",
      budgetHours: "10",
      budgetAmount: 200000,
      sortOrder: 1,
    })
    .returning();
  const [r1] = await db
    .insert(resource)
    .values({
      organizationId: org.id,
      entityId: ent.id,
      name: "R1",
      billRate: 22500,
      costRate: 9000,
      targetUtilization: "75",
    })
    .returning();
  const [r2] = await db
    .insert(resource)
    .values({
      organizationId: org.id,
      entityId: ent.id,
      name: "R2",
      billRate: 20000,
      costRate: 10000,
      targetUtilization: "60",
    })
    .returning();
  const [ind] = await db
    .insert(indirectCode)
    .values({
      organizationId: org.id,
      entityId: ent.id,
      code: "OH",
      category: "overhead",
    })
    .returning();

  const t = (over: Partial<typeof timeEntry.$inferInsert>) =>
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

  // Phase A: 8h (180000/72000) + 2h (45000/18000), both approved.
  await t({ hours: "8.00", billableAmount: 180000, costAmount: 72000 });
  await t({ hours: "2.00", billableAmount: 45000, costAmount: 18000 });
  // Phase B: r2 5h (100000/50000), approved.
  await t({
    resourceId: r2.id,
    phaseId: phB.id,
    hours: "5.00",
    billableAmount: 100000,
    costAmount: 50000,
  });
  // Unphased project time: r1 3h (67500/27000), submitted (not yet WIP-eligible).
  await t({
    phaseId: null,
    hours: "3.00",
    billableAmount: 67500,
    costAmount: 27000,
    status: "submitted",
  });
  // Indirect: r2 4h, non-billable (DB enforces billableAmount 0), approved.
  await t({
    resourceId: r2.id,
    chargeType: "indirect",
    projectId: null,
    phaseId: null,
    indirectCodeId: ind.id,
    hours: "4.00",
    billable: false,
    billRate: 0,
    billableAmount: 0,
    costRate: 10000,
    costAmount: 40000,
    status: "approved",
  });

  // Billable expense 100.00 + 10% = 110.00.
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

  return { actor: { orgId: org.id, actorId: r1.id }, entityId: ent.id, projectId: proj.id, r1: r1.id, r2: r2.id };
}

// Ground truth: raw sums straight from the time_entry table.
async function rawTotals(entityId: string) {
  const [row] = await db
    .select({
      billable: sql<number>`coalesce(sum(${timeEntry.billableAmount}),0)::int`,
      cost: sql<number>`coalesce(sum(${timeEntry.costAmount}),0)::int`,
      hours: sql<number>`coalesce(sum(${timeEntry.hours}),0)::float`,
      billableHours: sql<number>`coalesce(sum(case when ${timeEntry.billable} then ${timeEntry.hours} else 0 end),0)::float`,
    })
    .from(timeEntry)
    .where(eq(timeEntry.entityId, entityId));
  return row;
}

describe("reporting reconciliation", () => {
  it("firm dashboard totals match the underlying time records", async () => {
    const s = await setup();
    const dash = await firmDashboard(db, s.entityId, RANGE, "2026-08-10");
    const raw = await rawTotals(s.entityId);

    expect(dash.billable).toBe(raw.billable); // 392500
    expect(dash.cost).toBe(raw.cost); // 207000
    expect(dash.billableHours).toBe(raw.billableHours); // 18
    expect(dash.totalHours).toBe(raw.hours); // 22
    expect(dash.margin).toBe(raw.billable - raw.cost);
    expect(dash.billable).toBe(392500);
    expect(dash.cost).toBe(207000);
  });

  it("project + phase profitability reconciles to the project's time", async () => {
    const s = await setup();
    const [p] = await projectProfitability(db, s.entityId, RANGE);

    // Phase rows sum to the project totals.
    const sumBillable = p.phases.reduce((a, r) => a + r.billableValue, 0);
    const sumCost = p.phases.reduce((a, r) => a + r.cost, 0);
    const sumHours = p.phases.reduce((a, r) => a + r.actualHours, 0);
    expect(sumBillable).toBe(p.billableValue);
    expect(sumCost).toBe(p.cost);
    expect(sumHours).toBe(p.actualHours);

    // Known values.
    expect(p.billableValue).toBe(392500);
    expect(p.cost).toBe(167000);
    expect(p.margin).toBe(225500);
    expect(p.actualHours).toBe(18);
    expect(p.budgetHours).toBe(30); // 20 + 10
    expect(p.pctFeeUsed).toBe(78.5); // 392500 / 500000

    // A phase breakdown that ties out.
    const design = p.phases.find((r) => r.phaseName === "Design")!;
    expect(design.billableValue).toBe(225000);
    expect(design.cost).toBe(90000);
    const unphased = p.phases.find((r) => r.phaseName === "Unphased")!;
    expect(unphased.billableValue).toBe(67500);

    // Project billable value ties to firm billable (indirect is never billable).
    const dash = await firmDashboard(db, s.entityId, RANGE, "2026-08-10");
    const projSum = (await projectProfitability(db, s.entityId, RANGE)).reduce(
      (a, r) => a + r.billableValue,
      0,
    );
    expect(projSum).toBe(dash.billable);
  });

  it("utilization reconciles to firm hours and applies targets", async () => {
    const s = await setup();
    const util = await utilizationByResource(db, s.entityId, RANGE);
    const dash = await firmDashboard(db, s.entityId, RANGE, "2026-08-10");

    const sumBillable = util.reduce((a, r) => a + r.billableHours, 0);
    const sumTotal = util.reduce((a, r) => a + r.totalHours, 0);
    expect(sumBillable).toBe(dash.billableHours); // 18
    expect(sumTotal).toBe(dash.totalHours); // 22

    const r1 = util.find((r) => r.resourceId === s.r1)!;
    expect(r1.billableHours).toBe(13); // 8 + 2 + 3
    expect(r1.totalHours).toBe(13);
    expect(r1.utilizationPct).toBe(100);
    expect(r1.targetPct).toBe(75);

    const r2 = util.find((r) => r.resourceId === s.r2)!;
    expect(r2.billableHours).toBe(5);
    expect(r2.totalHours).toBe(9); // 5 billable + 4 indirect
  });

  it("WIP and AR reconcile before and after invoicing", async () => {
    const s = await setup();

    // Before invoicing: sum of project WIP == firm labor WIP.
    const before = await projectProfitability(db, s.entityId, RANGE);
    const wipSumBefore = before.reduce((a, r) => a + r.wip, 0);
    const wip = await computeWip(db, s.entityId);
    expect(wipSumBefore).toBe(wip.time); // 325000 (approved, billable, uninvoiced)
    expect(wipSumBefore).toBe(325000);

    // Invoice the approved, billable, uninvoiced time + expense; then send it.
    const invId = await generateDraftInvoice(db, s.actor, {
      entityId: s.entityId,
      projectId: s.projectId,
      periodStart: RANGE.from,
      periodEnd: RANGE.to,
      groupBy: "phase",
    });
    await markInvoiceSent(db, s.actor, invId, "2026-08-01");

    // After: labor WIP drained; AR now carries the invoice total.
    const after = await projectProfitability(db, s.entityId, RANGE);
    const wipSumAfter = after.reduce((a, r) => a + r.wip, 0);
    const dash = await firmDashboard(db, s.entityId, RANGE, "2026-08-10");
    expect(wipSumAfter).toBe(0);
    expect(dash.wipTime).toBe(0);
    expect(dash.arOutstanding).toBe(336000); // 325000 time + 11000 expense
  });
});
