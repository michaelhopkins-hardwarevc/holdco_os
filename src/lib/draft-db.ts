import { and, eq, gte, isNotNull, isNull, lt } from "drizzle-orm";
import { activityEvent, signal } from "@/db/schema";
import type { CaptureActor } from "@/lib/capture-db";
import { draftBlocks, type DraftInputEvent } from "@/lib/draft";
import type { QueryDb } from "@/lib/queries";

// Persist the Draft stage: cluster a resource's captured activity_events into
// work blocks and upsert them as `signal` rows, so they surface on the existing
// timesheet confirm surface. Resolved blocks arrive pre-charged to a project;
// unresolved blocks arrive with no charge for the person to link (which the
// confirm flow then remembers as a rule). Additive — never writes a time_entry.
//
// Idempotent per (resource, day, project): re-drafting refreshes an open draft
// in place; it never touches a signal the person already accepted or dismissed.

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
  const events = await db
    .select({
      id: activityEvent.id,
      occurredAt: activityEvent.occurredAt,
      hardness: activityEvent.hardness,
      resolvedProjectId: activityEvent.resolvedProjectId,
      resolvedClientId: activityEvent.resolvedClientId,
      resolutionConfidence: activityEvent.resolutionConfidence,
    })
    .from(activityEvent)
    .where(
      and(
        eq(activityEvent.entityId, entityId),
        eq(activityEvent.personId, resourceId),
        gte(activityEvent.occurredAt, new Date(range.start)),
        lt(activityEvent.occurredAt, new Date(range.end)),
        isNull(activityEvent.deletedAt),
      ),
    );

  const input: DraftInputEvent[] = events.map((e) => ({
    id: e.id,
    occurredAt: e.occurredAt.toISOString(),
    hardness: e.hardness,
    resolvedProjectId: e.resolvedProjectId,
    resolvedClientId: e.resolvedClientId,
    resolutionConfidence: e.resolutionConfidence,
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

    // One open draft per (resource, day, project) — stable so re-drafts update
    // in place rather than duplicating.
    const externalId = `${b.workDate}:${b.projectId ?? "unresolved"}`;
    const evidence = resolved
      ? `Drafted from ${b.eventIds.length} activity event${b.eventIds.length === 1 ? "" : "s"}`
      : `${b.eventIds.length} unlinked activity event${b.eventIds.length === 1 ? "" : "s"} — pick a charge`;

    await db
      .insert(signal)
      .values({
        organizationId: actor.orgId,
        entityId,
        resourceId,
        workDate: b.workDate,
        provider: "activity",
        externalId,
        evidence,
        provenance: `${b.hours.toFixed(2)} h · ${b.confidence} confidence`,
        chargeType: "project",
        projectId: b.projectId,
        proposedHours: b.hours.toFixed(2),
        confidence: b.confidence,
        billable: resolved,
        state: "open",
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
          provenance: `${b.hours.toFixed(2)} h · ${b.confidence} confidence`,
          updatedBy: actor.actorId,
          updatedAt: new Date(),
        },
      });
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
