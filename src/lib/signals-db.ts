import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { signal, timeEntry } from "@/db/schema";
import type { QueryDb } from "@/lib/queries";
import { computeAmounts, getWeek } from "@/lib/timesheet";
import { type Actor, type ResourceRates, TimesheetLockedError } from "@/lib/timesheet-db";

// DB operations for Signals, split out from the server actions so they can be
// tested against a real Postgres engine. Only accepting a signal writes a
// time_entry (design handoff: "Nothing writes a time_entry except acceptance").

type SignalRow = typeof signal.$inferSelect;

// The charge a user picked for a signal (overrides the machine's guess).
export type ChargeOverride = {
  chargeType: "project" | "indirect";
  projectId: string | null;
  phaseId: string | null;
  indirectCodeId: string | null;
};

/**
 * Accept a signal: turn it into (or fold it into) a draft time entry for the
 * resource, then mark the signal accepted and link it. Idempotent — a signal
 * that's already accepted returns its existing time_entry id. Throws if the
 * target week is locked.
 */
export async function acceptSignal(
  db: QueryDb,
  actor: Actor,
  rates: ResourceRates,
  sig: SignalRow,
  override?: ChargeOverride,
): Promise<string | null> {
  if (sig.state !== "open") return sig.timeEntryId;

  const week = getWeek(sig.workDate);
  const weekEntries = await db
    .select({ status: timeEntry.status })
    .from(timeEntry)
    .where(
      and(
        eq(timeEntry.resourceId, sig.resourceId),
        gte(timeEntry.workDate, week.start),
        lte(timeEntry.workDate, week.end),
        isNull(timeEntry.deletedAt),
      ),
    );
  if (!weekEntries.every((e) => e.status === "draft")) {
    throw new TimesheetLockedError();
  }

  const charge: ChargeOverride = override ?? {
    chargeType: sig.chargeType,
    projectId: sig.projectId,
    phaseId: sig.phaseId,
    indirectCodeId: sig.indirectCodeId,
  };
  const isProject = charge.chargeType === "project";
  const projectId = isProject ? charge.projectId : null;
  const phaseId = isProject ? charge.phaseId : null;
  const indirectCodeId = isProject ? null : charge.indirectCodeId;
  const billable = isProject; // project time bills; indirect never does
  const hours = Number(sig.proposedHours);

  // Fold into an existing draft cell for the same charge + day, if any.
  const dayEntries = await db
    .select()
    .from(timeEntry)
    .where(
      and(
        eq(timeEntry.resourceId, sig.resourceId),
        eq(timeEntry.workDate, sig.workDate),
        eq(timeEntry.status, "draft"),
        isNull(timeEntry.deletedAt),
      ),
    );
  const match = dayEntries.find(
    (e) =>
      e.chargeType === charge.chargeType &&
      e.projectId === projectId &&
      e.phaseId === phaseId &&
      e.indirectCodeId === indirectCodeId,
  );

  let entryId: string;
  if (match) {
    const newHours = Number(match.hours) + hours;
    const amounts = computeAmounts({
      hours: newHours,
      billable,
      billRate: rates.billRate,
      costRate: rates.costRate,
    });
    await db
      .update(timeEntry)
      .set({
        hours: newHours.toFixed(2),
        billableAmount: amounts.billableAmount,
        costAmount: amounts.costAmount,
        updatedBy: actor.actorId,
      })
      .where(eq(timeEntry.id, match.id));
    entryId = match.id;
  } else {
    const amounts = computeAmounts({
      hours,
      billable,
      billRate: rates.billRate,
      costRate: rates.costRate,
    });
    const [ins] = await db
      .insert(timeEntry)
      .values({
        organizationId: actor.orgId,
        entityId: sig.entityId,
        resourceId: sig.resourceId,
        workDate: sig.workDate,
        chargeType: charge.chargeType,
        projectId,
        phaseId,
        indirectCodeId,
        hours: hours.toFixed(2),
        billable,
        billRate: rates.billRate,
        costRate: rates.costRate,
        billableAmount: amounts.billableAmount,
        costAmount: amounts.costAmount,
        status: "draft",
        notes: `From signal: ${sig.evidence}`,
        createdBy: actor.actorId,
        updatedBy: actor.actorId,
      })
      .returning({ id: timeEntry.id });
    entryId = ins.id;
  }

  await db
    .update(signal)
    .set({
      state: "accepted",
      timeEntryId: entryId,
      chargeType: charge.chargeType,
      projectId,
      phaseId,
      indirectCodeId,
      billable,
      updatedBy: actor.actorId,
    })
    .where(eq(signal.id, sig.id));

  return entryId;
}

export async function dismissSignal(
  db: QueryDb,
  actor: Actor,
  sig: SignalRow,
): Promise<void> {
  if (sig.state !== "open") return;
  await db
    .update(signal)
    .set({ state: "dismissed", updatedBy: actor.actorId })
    .where(eq(signal.id, sig.id));
}

export async function acceptOpenSignals(
  db: QueryDb,
  actor: Actor,
  rates: ResourceRates,
  signals: SignalRow[],
): Promise<number> {
  let accepted = 0;
  for (const sig of signals) {
    if (sig.state !== "open") continue;
    await acceptSignal(db, actor, rates, sig);
    accepted += 1;
  }
  return accepted;
}
