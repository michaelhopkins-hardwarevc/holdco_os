import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { auditLog, signal, timeEntry } from "@/db/schema";
import { learnFromAcceptance } from "@/lib/learn-db";
import type { QueryDb } from "@/lib/queries";
import { recordRule } from "@/lib/rules-db";
import { computeAmounts, getWeek } from "@/lib/timesheet";
import {
  type Actor,
  type ResourceRates,
  TimesheetLockedError,
} from "@/lib/timesheet-db";

// DB operations for Signals, split out from the server actions so they can be
// tested against a real Postgres engine. Only accepting a signal writes a
// time_entry (design handoff: "Nothing writes a time_entry except acceptance").
//
// Confirmed = approved (operator decision, Sep 2026): a person confirming a
// drafted block is the approval. The entry lands `approved` and is billable at
// once; managers review exceptions weekly instead of gating every week.

type SignalRow = typeof signal.$inferSelect;

// The charge a user picked for a signal (overrides the machine's guess).
export type ChargeOverride = {
  chargeType: "project" | "indirect";
  projectId: string | null;
  phaseId: string | null;
  indirectCodeId: string | null;
};

// A week is locked once it has been submitted for review or invoiced. Approved
// (confirmed) time does not lock the week; more can be confirmed alongside it.
export function weekIsLocked(statuses: string[]): boolean {
  return statuses.some((s) => s === "submitted" || s === "invoiced");
}

/**
 * A time entry's note carries the block's plain-language evidence, so the
 * narrative survives to the invoice line instead of being lost at accept.
 * Folding a second block into the same day + charge appends its line rather
 * than dropping it; an identical line is never repeated.
 */
export function mergeNotes(
  existing: string | null,
  incoming: string | null,
): string | null {
  const add = (incoming ?? "").trim();
  const have = (existing ?? "").trim();
  if (!add) return have || null;
  if (!have) return add;
  if (have.split("\n").some((l) => l.trim() === add)) return have;
  return `${have}\n${add}`;
}

/**
 * Accept a signal: turn it into (or fold it into) an approved time entry for
 * the resource, mark the signal accepted, link it, and learn from the choice.
 * Idempotent (an accepted signal returns its existing entry). Throws if the
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
  if (weekIsLocked(weekEntries.map((e) => e.status))) {
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

  // An unresolved draft (no project and no indirect code) can't post a time
  // entry. Leave it open for the person to link a charge first. This is what
  // lets "Accept all" skip unlinked activity drafts instead of failing on them.
  const hasTarget = isProject ? !!projectId : !!indirectCodeId;
  if (!hasTarget) return null;

  // Fold into an existing open cell (draft or approved) for the same charge +
  // day, if any. Invoiced cells are never touched.
  const dayEntries = await db
    .select()
    .from(timeEntry)
    .where(
      and(
        eq(timeEntry.resourceId, sig.resourceId),
        eq(timeEntry.workDate, sig.workDate),
        inArray(timeEntry.status, ["draft", "approved"]),
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
        notes: mergeNotes(match.notes, sig.evidence),
        status: "approved",
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
        status: "approved",
        notes: mergeNotes(null, sig.evidence),
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

  // Confirming is the approval: record it like one.
  await db.insert(auditLog).values({
    organizationId: actor.orgId,
    entityId: sig.entityId,
    tableName: "time_entry",
    recordId: entryId,
    action: "confirm",
    actorId: actor.actorId,
    after: { signalId: sig.id, hours, projectId, indirectCodeId, status: "approved" },
  });

  // Learn from the decision so the next sync proposes the same charge:
  //  - an activity-drafted block teaches the crosswalks from its source refs
  //    (a board, a deal, a domain), which is what resolves future events;
  //  - a titled single-source signal (a calendar item) teaches a subject rule.
  if (sig.provider === "activity") {
    if (sig.learnHints && sig.learnHints.length > 0) {
      const target = isProject
        ? projectId
          ? ({ kind: "project", projectId } as const)
          : null
        : indirectCodeId
          ? ({ kind: "indirect", indirectCodeId } as const)
          : null;
      if (target) {
        await learnFromAcceptance(
          db,
          { orgId: actor.orgId, actorId: actor.actorId },
          { entityId: sig.entityId, hints: sig.learnHints, target },
        );
      }
    }
  } else {
    await recordRule(db, actor, {
      entityId: sig.entityId,
      resourceId: sig.resourceId,
      subject: sig.evidence,
      charge: {
        chargeType: charge.chargeType,
        projectId,
        phaseId,
        indirectCodeId,
      },
    });
  }

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
    // Skipped unresolved drafts return null and stay open; don't count them.
    const entryId = await acceptSignal(db, actor, rates, sig);
    if (entryId) accepted += 1;
  }
  return accepted;
}
