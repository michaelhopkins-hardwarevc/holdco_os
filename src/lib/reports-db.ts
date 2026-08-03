import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { phase, project, resource, timeEntry } from "@/db/schema";
import { computeArAging, computeWip } from "@/lib/invoicing-db";
import type { QueryDb } from "@/lib/queries";
import { marginPct, pctFeeUsed, utilizationPct } from "@/lib/reports";

// A date range. Both bounds are inclusive ISO dates (YYYY-MM-DD). Either may be
// null to leave that side open (profitability defaults to project-to-date).
export type DateRange = { from: string | null; to: string | null };

function timeInRange(entityId: string, range?: DateRange) {
  const conds = [
    eq(timeEntry.entityId, entityId),
    isNull(timeEntry.deletedAt),
  ];
  if (range?.from) conds.push(gte(timeEntry.workDate, range.from));
  if (range?.to) conds.push(lte(timeEntry.workDate, range.to));
  return and(...conds);
}

// Reusable SQL sums over time_entry. Hours are numeric; cents are integers.
const sumHours = sql<number>`coalesce(sum(${timeEntry.hours}), 0)::float`;
const sumBillableHours = sql<number>`coalesce(sum(case when ${timeEntry.billable} then ${timeEntry.hours} else 0 end), 0)::float`;
const sumBillable = sql<number>`coalesce(sum(${timeEntry.billableAmount}), 0)::int`;
const sumCost = sql<number>`coalesce(sum(${timeEntry.costAmount}), 0)::int`;
// WIP = approved, billable, not yet invoiced (matches computeWip's time leg).
const sumWip = sql<number>`coalesce(sum(case when ${timeEntry.status} = 'approved' and ${timeEntry.billable} and ${timeEntry.invoiceId} is null then ${timeEntry.billableAmount} else 0 end), 0)::int`;

// --- Project profitability --------------------------------------------------

export type PhaseProfit = {
  phaseId: string | null;
  phaseName: string;
  budgetHours: number | null;
  budgetAmount: number | null;
  actualHours: number;
  billableValue: number;
  cost: number;
  margin: number;
  wip: number;
};

export type ProjectProfit = {
  projectId: string;
  code: string;
  name: string;
  type: string;
  contractValue: number | null;
  budgetHours: number | null;
  actualHours: number;
  billableValue: number;
  cost: number;
  margin: number;
  marginPct: number | null;
  pctFeeUsed: number | null;
  wip: number;
  phases: PhaseProfit[];
};

/**
 * Budget-vs-actual profitability for every project in an entity, broken down by
 * phase. Actuals cover all logged time (any status). "Unphased" collects
 * project time with no phase. Optional range narrows the actuals window;
 * budgets and % fee used are always project-to-date figures.
 */
export async function projectProfitability(
  db: QueryDb,
  entityId: string,
  range?: DateRange,
): Promise<ProjectProfit[]> {
  const projects = await db
    .select({
      id: project.id,
      code: project.code,
      name: project.name,
      type: project.type,
      contractValue: project.contractValue,
    })
    .from(project)
    .where(and(eq(project.entityId, entityId), isNull(project.deletedAt)))
    .orderBy(project.code);

  const phases = await db
    .select({
      id: phase.id,
      projectId: phase.projectId,
      name: phase.name,
      budgetHours: phase.budgetHours,
      budgetAmount: phase.budgetAmount,
      sortOrder: phase.sortOrder,
    })
    .from(phase)
    .where(and(eq(phase.entityId, entityId), isNull(phase.deletedAt)))
    .orderBy(phase.sortOrder);

  // Actuals aggregated by (project, phase). phaseId is null for unphased time.
  const actuals = await db
    .select({
      projectId: timeEntry.projectId,
      phaseId: timeEntry.phaseId,
      actualHours: sumHours,
      billableValue: sumBillable,
      cost: sumCost,
      wip: sumWip,
    })
    .from(timeEntry)
    .where(and(timeInRange(entityId, range), sql`${timeEntry.projectId} is not null`))
    .groupBy(timeEntry.projectId, timeEntry.phaseId);

  const actualByKey = new Map<string, (typeof actuals)[number]>();
  for (const a of actuals) {
    actualByKey.set(`${a.projectId}:${a.phaseId ?? "none"}`, a);
  }

  return projects.map((p) => {
    const projPhases = phases.filter((ph) => ph.projectId === p.id);
    const phaseRows: PhaseProfit[] = [];

    for (const ph of projPhases) {
      const a = actualByKey.get(`${p.id}:${ph.id}`);
      const billableValue = a?.billableValue ?? 0;
      const cost = a?.cost ?? 0;
      phaseRows.push({
        phaseId: ph.id,
        phaseName: ph.name,
        budgetHours: ph.budgetHours === null ? null : Number(ph.budgetHours),
        budgetAmount: ph.budgetAmount,
        actualHours: a?.actualHours ?? 0,
        billableValue,
        cost,
        margin: billableValue - cost,
        wip: a?.wip ?? 0,
      });
    }

    // Unphased project time, if any.
    const unphased = actualByKey.get(`${p.id}:none`);
    if (unphased) {
      phaseRows.push({
        phaseId: null,
        phaseName: "Unphased",
        budgetHours: null,
        budgetAmount: null,
        actualHours: unphased.actualHours,
        billableValue: unphased.billableValue,
        cost: unphased.cost,
        margin: unphased.billableValue - unphased.cost,
        wip: unphased.wip,
      });
    }

    const actualHours = phaseRows.reduce((s, r) => s + r.actualHours, 0);
    const billableValue = phaseRows.reduce((s, r) => s + r.billableValue, 0);
    const cost = phaseRows.reduce((s, r) => s + r.cost, 0);
    const wip = phaseRows.reduce((s, r) => s + r.wip, 0);
    const budgetHoursParts = projPhases
      .map((ph) => (ph.budgetHours === null ? null : Number(ph.budgetHours)))
      .filter((n): n is number => n !== null);
    const budgetHours =
      budgetHoursParts.length > 0
        ? budgetHoursParts.reduce((s, n) => s + n, 0)
        : null;

    return {
      projectId: p.id,
      code: p.code,
      name: p.name,
      type: p.type,
      contractValue: p.contractValue,
      budgetHours,
      actualHours,
      billableValue,
      cost,
      margin: billableValue - cost,
      marginPct: marginPct(billableValue, cost),
      pctFeeUsed: pctFeeUsed(billableValue, p.contractValue),
      wip,
      phases: phaseRows,
    };
  });
}

// --- Utilization ------------------------------------------------------------

export type ResourceUtilization = {
  resourceId: string;
  name: string;
  title: string | null;
  billableHours: number;
  totalHours: number;
  utilizationPct: number | null;
  targetPct: number | null;
};

/**
 * Billable vs total hours per resource over a period, against each resource's
 * utilization target. Includes resources with no time in the period (0 hours).
 */
export async function utilizationByResource(
  db: QueryDb,
  entityId: string,
  range: DateRange,
): Promise<ResourceUtilization[]> {
  const resources = await db
    .select({
      id: resource.id,
      name: resource.name,
      title: resource.title,
      targetUtilization: resource.targetUtilization,
    })
    .from(resource)
    .where(and(eq(resource.entityId, entityId), isNull(resource.deletedAt)))
    .orderBy(resource.name);

  const agg = await db
    .select({
      resourceId: timeEntry.resourceId,
      billableHours: sumBillableHours,
      totalHours: sumHours,
    })
    .from(timeEntry)
    .where(timeInRange(entityId, range))
    .groupBy(timeEntry.resourceId);

  const byResource = new Map<string, (typeof agg)[number]>();
  for (const a of agg) byResource.set(a.resourceId, a);

  return resources.map((r) => {
    const a = byResource.get(r.id);
    const billableHours = a?.billableHours ?? 0;
    const totalHours = a?.totalHours ?? 0;
    return {
      resourceId: r.id,
      name: r.name,
      title: r.title,
      billableHours,
      totalHours,
      utilizationPct: utilizationPct(billableHours, totalHours),
      targetPct:
        r.targetUtilization === null ? null : Number(r.targetUtilization),
    };
  });
}

// --- Firm dashboard ---------------------------------------------------------

export type FirmDashboard = {
  from: string | null;
  to: string | null;
  billable: number;
  cost: number;
  margin: number;
  marginPct: number | null;
  billableHours: number;
  totalHours: number;
  utilizationPct: number | null;
  wip: number; // time + expense (point-in-time balance)
  wipTime: number; // labor-only WIP; reconciles to sum of project WIP
  arOutstanding: number;
};

/**
 * Firm-wide KPIs for an entity over a date range. Billable/cost/margin/
 * utilization cover time in the range; WIP and AR are point-in-time balances
 * (as of the range end, or today).
 */
export async function firmDashboard(
  db: QueryDb,
  entityId: string,
  range: DateRange,
  asOf: string,
): Promise<FirmDashboard> {
  const [totals] = await db
    .select({
      billable: sumBillable,
      cost: sumCost,
      billableHours: sumBillableHours,
      totalHours: sumHours,
    })
    .from(timeEntry)
    .where(timeInRange(entityId, range));

  const wip = await computeWip(db, entityId);
  const ar = await computeArAging(db, entityId, range.to ?? asOf);

  return {
    from: range.from,
    to: range.to,
    billable: totals.billable,
    cost: totals.cost,
    margin: totals.billable - totals.cost,
    marginPct: marginPct(totals.billable, totals.cost),
    billableHours: totals.billableHours,
    totalHours: totals.totalHours,
    utilizationPct: utilizationPct(totals.billableHours, totals.totalHours),
    wip: wip.total,
    wipTime: wip.time,
    arOutstanding: ar.total,
  };
}
