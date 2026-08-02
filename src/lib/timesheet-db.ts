import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { auditLog, timeEntry } from "@/db/schema";
import type { QueryDb } from "@/lib/queries";
import {
  computeAmounts,
  getWeek,
  type SaveTimesheetInput,
} from "@/lib/timesheet";

// DB operations for the timesheet, split out from the server actions so they
// can be tested against a real Postgres engine without an auth request.

export type Actor = { orgId: string; actorId: string };
export type ResourceRates = { billRate: number; costRate: number };

export class TimesheetLockedError extends Error {
  constructor() {
    super(
      "This week has been submitted and is locked. Ask a manager to reject it before editing.",
    );
    this.name = "TimesheetLockedError";
  }
}

function cellKey(e: {
  workDate: string;
  chargeType: string;
  projectId: string | null;
  phaseId: string | null;
  indirectCodeId: string | null;
}) {
  return `${e.workDate}|${e.chargeType}|${e.projectId ?? ""}|${e.phaseId ?? ""}|${e.indirectCodeId ?? ""}`;
}

/** Upsert a week's cells for a resource. Throws if the week is locked. */
export async function applyTimesheet(
  db: QueryDb,
  actor: Actor,
  res: ResourceRates,
  input: SaveTimesheetInput,
): Promise<void> {
  const week = getWeek(input.weekStart);
  const existing = await db
    .select()
    .from(timeEntry)
    .where(
      and(
        eq(timeEntry.entityId, input.entityId),
        eq(timeEntry.resourceId, input.resourceId),
        gte(timeEntry.workDate, week.start),
        lte(timeEntry.workDate, week.end),
        isNull(timeEntry.deletedAt),
      ),
    );

  if (!existing.every((e) => e.status === "draft")) {
    throw new TimesheetLockedError();
  }

  const existingByKey = new Map(existing.map((e) => [cellKey(e), e]));
  const seen = new Set<string>();

  for (const cell of input.cells) {
    if (!week.days.includes(cell.date)) continue;
    const hours = Number(cell.hours);
    const projectId = cell.chargeType === "project" ? cell.projectId ?? null : null;
    const phaseId = cell.chargeType === "project" ? cell.phaseId ?? null : null;
    const indirectCodeId =
      cell.chargeType === "indirect" ? cell.indirectCodeId ?? null : null;
    const key = cellKey({
      workDate: cell.date,
      chargeType: cell.chargeType,
      projectId,
      phaseId,
      indirectCodeId,
    });
    seen.add(key);

    const billable = cell.chargeType === "project";
    const { billableAmount, costAmount } = computeAmounts({
      hours: Number.isFinite(hours) ? hours : 0,
      billable,
      billRate: res.billRate,
      costRate: res.costRate,
    });
    const found = existingByKey.get(key);

    if (!Number.isFinite(hours) || hours <= 0) {
      if (found) {
        await db
          .update(timeEntry)
          .set({ deletedAt: new Date(), updatedBy: actor.actorId })
          .where(eq(timeEntry.id, found.id));
      }
      continue;
    }

    if (found) {
      await db
        .update(timeEntry)
        .set({
          hours: hours.toFixed(2),
          billable,
          billRate: res.billRate,
          costRate: res.costRate,
          billableAmount,
          costAmount,
          updatedBy: actor.actorId,
        })
        .where(eq(timeEntry.id, found.id));
    } else {
      await db.insert(timeEntry).values({
        organizationId: actor.orgId,
        entityId: input.entityId,
        resourceId: input.resourceId,
        workDate: cell.date,
        chargeType: cell.chargeType,
        projectId,
        phaseId,
        indirectCodeId,
        hours: hours.toFixed(2),
        billable,
        billRate: res.billRate,
        costRate: res.costRate,
        billableAmount,
        costAmount,
        status: "draft",
        createdBy: actor.actorId,
        updatedBy: actor.actorId,
      });
    }
  }

  for (const [key, e] of existingByKey) {
    if (!seen.has(key)) {
      await db
        .update(timeEntry)
        .set({ deletedAt: new Date(), updatedBy: actor.actorId })
        .where(eq(timeEntry.id, e.id));
    }
  }
}

export async function submitTimesheetWeek(
  db: QueryDb,
  actor: Actor,
  entityId: string,
  resourceId: string,
  weekStart: string,
): Promise<number> {
  const week = getWeek(weekStart);
  const affected = await db
    .update(timeEntry)
    .set({ status: "submitted", updatedBy: actor.actorId })
    .where(
      and(
        eq(timeEntry.entityId, entityId),
        eq(timeEntry.resourceId, resourceId),
        gte(timeEntry.workDate, week.start),
        lte(timeEntry.workDate, week.end),
        eq(timeEntry.status, "draft"),
        isNull(timeEntry.deletedAt),
      ),
    )
    .returning({ id: timeEntry.id });
  return affected.length;
}

/** Approve (submitted->approved) or reject (submitted->draft) a week, and write
 *  the change to the audit log. Returns the number of entries affected. */
export async function transitionTimesheetWeek(
  db: QueryDb,
  actor: Actor,
  entityId: string,
  resourceId: string,
  weekStart: string,
  to: "approved" | "draft",
  action: "approve" | "reject",
  note: string | null,
): Promise<number> {
  const week = getWeek(weekStart);
  const affected = await db
    .update(timeEntry)
    .set({ status: to, updatedBy: actor.actorId })
    .where(
      and(
        eq(timeEntry.entityId, entityId),
        eq(timeEntry.resourceId, resourceId),
        gte(timeEntry.workDate, week.start),
        lte(timeEntry.workDate, week.end),
        eq(timeEntry.status, "submitted"),
        isNull(timeEntry.deletedAt),
      ),
    )
    .returning({ id: timeEntry.id });

  await db.insert(auditLog).values({
    organizationId: actor.orgId,
    entityId,
    tableName: "time_entry",
    recordId: resourceId,
    action,
    actorId: actor.actorId,
    before: { status: "submitted", weekStart },
    after: { status: to, weekStart, entries: affected.length, note },
  });

  return affected.length;
}
