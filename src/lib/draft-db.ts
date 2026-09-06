import { and, eq, gte, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { activityEvent, signal } from "@/db/schema";
import type { CaptureActor } from "@/lib/capture-db";
import { describeHints, draftBlocks, type DraftInputEvent } from "@/lib/draft";
import type { QueryDb } from "@/lib/queries";

// Persist the Draft stage: cluster a resource's captured activity_events into
// work blocks and upsert them as `signal` rows, so they surface on the existing
// timesheet confirm surface. Resolved blocks arrive pre-charged to a project;
// unresolved blocks arrive with no charge for the person to link (which the
// confirm flow then turns into a crosswalk rule). Additive: never writes a
// time_entry.
//
// Guardrails: an event already folded into a block the person confirmed or
// dismissed is never re-drafted (no double counting, no resurrecting a skip);
// every drafted block links back to its events (activity_event.signal_id), so
// evidence is auditable and corrections can learn from the sources behind it.

export type DraftSummary = {
  blocks: number;
  resolved: number;
  unresolved: number;
};
export type EntityDraftSummary = DraftSummary & { resources: number };

export async function draftSignalsForResource(
  db: QueryDb,
  actor: CaptureActor,
  entityId: string,
  resourceId: string,
  range: { start: string; end: string },
): Promise<DraftSummary> {
  const rows = await db
    .select({
      id: activityEvent.id,
      occurredAt: activityEvent.occurredAt,
      endedAt: activityEvent.endedAt,
      hardness: activityEvent.hardness,
      resolvedProjectId: activityEvent.resolvedProjectId,
      resolvedClientId: activityEvent.resolvedClientId,
      resolutionConfidence: activityEvent.resolutionConfidence,
      eventType: activityEvent.eventType,
      subject: activityEvent.subject,
      counterparty: activityEvent.counterparty,
      sourceRef: activityEvent.sourceRef,
      linkedState: signal.state,
    })
    .from(activityEvent)
    .leftJoin(signal, eq(signal.id, activityEvent.signalId))
    .where(
      and(
        eq(activityEvent.entityId, entityId),
        eq(activityEvent.personId, resourceId),
        gte(activityEvent.occurredAt, new Date(range.start)),
        lt(activityEvent.occurredAt, new Date(range.end)),
        isNull(activityEvent.deletedAt),
      ),
    );

  // Never re-draft an event the person already confirmed or skipped.
  const input: DraftInputEvent[] = rows
    .filter((r) => r.linkedState !== "accepted" && r.linkedState !== "dismissed")
    .map((e) => ({
      id: e.id,
      occurredAt: e.occurredAt.toISOString(),
      endedAt: e.endedAt ? e.endedAt.toISOString() : null,
      hardness: e.hardness,
      resolvedProjectId: e.resolvedProjectId,
      resolvedClientId: e.resolvedClientId,
      resolutionConfidence: e.resolutionConfidence,
      eventType: e.eventType,
      subject: e.subject,
      counterparty: e.counterparty,
      sourceRef: e.sourceRef,
    }));

  const blocks = draftBlocks(input);
  const summary: DraftSummary = {
    blocks: blocks.length,
    resolved: 0,
    unresolved: 0,
  };

  for (const b of blocks) {
    const resolved = b.projectId !== null;
    if (resolved) summary.resolved += 1;
    else summary.unresolved += 1;

    // One open draft per (resource, day, project). Unresolved blocks key on
    // their strongest hint (or anchor event) so several can coexist in a day.
    const externalId = resolved
      ? `${b.workDate}:${b.projectId}`
      : `${b.workDate}:u:${b.learnHints[0] ?? b.anchorEventId}`;
    const hintLabel = b.learnHints.length ? ` · ${describeHints(b.learnHints)}` : "";
    const evidence = resolved
      ? b.evidence
      : `Pick a charge · ${b.evidence}${hintLabel}`;
    const provenance = `${b.hours.toFixed(2)} h · ${b.confidence} confidence`;

    const [row] = await db
      .insert(signal)
      .values({
        organizationId: actor.orgId,
        entityId,
        resourceId,
        workDate: b.workDate,
        provider: "activity",
        externalId,
        evidence,
        provenance,
        chargeType: "project",
        projectId: b.projectId,
        proposedHours: b.hours.toFixed(2),
        confidence: b.confidence,
        billable: resolved,
        state: "open",
        learnHints: b.learnHints,
        createdBy: actor.actorId,
        updatedBy: actor.actorId,
      })
      .onConflictDoUpdate({
        target: [signal.provider, signal.externalId, signal.resourceId],
        // Only refresh a still-open draft; never resurrect an accepted/dismissed one.
        setWhere: eq(signal.state, "open"),
        set: {
          projectId: b.projectId,
          proposedHours: b.hours.toFixed(2),
          confidence: b.confidence,
          billable: resolved,
          evidence,
          provenance,
          learnHints: b.learnHints,
          updatedBy: actor.actorId,
          updatedAt: new Date(),
        },
      })
      .returning({ id: signal.id });

    // Link the events to the block they were drafted into (auditable evidence,
    // and the double-count guard above). No row comes back when the upsert hit
    // a confirmed/dismissed signal, which keeps those links as they were.
    if (row) {
      await db
        .update(activityEvent)
        .set({ signalId: row.id })
        .where(inArray(activityEvent.id, b.eventIds));
    }
  }

  return summary;
}

/**
 * Draft for every resource with captured activity in the window. Runs after a
 * capture pull so one sync both captures and drafts.
 */
export async function draftForEntity(
  db: QueryDb,
  actor: CaptureActor,
  entityId: string,
  range: { start: string; end: string },
): Promise<EntityDraftSummary> {
  const rows = await db
    .selectDistinct({ personId: activityEvent.personId })
    .from(activityEvent)
    .where(
      and(
        eq(activityEvent.entityId, entityId),
        gte(activityEvent.occurredAt, new Date(range.start)),
        lt(activityEvent.occurredAt, new Date(range.end)),
        isNotNull(activityEvent.personId),
        isNull(activityEvent.deletedAt),
      ),
    );

  const total: EntityDraftSummary = {
    blocks: 0,
    resolved: 0,
    unresolved: 0,
    resources: 0,
  };
  for (const r of rows) {
    if (!r.personId) continue;
    const s = await draftSignalsForResource(
      db,
      actor,
      entityId,
      r.personId,
      range,
    );
    total.blocks += s.blocks;
    total.resolved += s.resolved;
    total.unresolved += s.unresolved;
    total.resources += 1;
  }
  return total;
}
