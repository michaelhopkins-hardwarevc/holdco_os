import { activityEvent, sourceSystem } from "@/db/schema";
import { loadCrosswalks } from "@/lib/crosswalk-db";
import { resolveEvent } from "@/lib/crosswalk-map";
import type { RawActivity } from "@/lib/integrations/capture";
import type { QueryDb } from "@/lib/queries";
import type { Actor } from "@/lib/timesheet-db";

// The Capture stage (WIS Day-One §3.1/§3.2). Land raw activity events and
// attach a resolution (person / client / project) via the M0 crosswalks. This
// writes ONLY activity_event; it never creates a time_entry or a signal
// (additive — drafting is M2). Idempotent by (entity, source system, source id)
// so re-syncs refresh resolution instead of duplicating.

export type CaptureSummary = {
  captured: number;
  resolvedToProject: number;
  resolvedToClientOnly: number;
  unresolved: number;
  hard: number;
};

/**
 * Capture a batch of normalized events for one entity: resolve each against the
 * crosswalks, then upsert into activity_event. Runs with the service role
 * (writes bypass RLS, like the other server-side writers). Returns a summary
 * that ties out to what landed.
 */
export async function captureActivities(
  db: QueryDb,
  actor: Actor,
  entityId: string,
  raws: RawActivity[],
): Promise<CaptureSummary> {
  const summary: CaptureSummary = {
    captured: 0,
    resolvedToProject: 0,
    resolvedToClientOnly: 0,
    unresolved: 0,
    hard: 0,
  };
  if (raws.length === 0) return summary;

  const xwalks = await loadCrosswalks(db, entityId);

  for (const raw of raws) {
    const r = resolveEvent(raw, xwalks);
    const resolved = r.projectId !== null || r.clientId !== null;

    await db
      .insert(activityEvent)
      .values({
        organizationId: actor.orgId,
        entityId,
        personId: r.resourceId,
        sourceSystem:
          raw.sourceSystem as (typeof sourceSystem.enumValues)[number],
        sourceEventId: raw.sourceEventId,
        eventType: raw.eventType,
        occurredAt: new Date(raw.occurredAt),
        hardness: raw.hardness,
        rawPayload: raw.raw,
        resolvedProjectId: r.projectId,
        resolvedClientId: r.clientId,
        resolutionConfidence: resolved ? r.confidence : null,
        matchedBy: r.matchedBy,
        createdBy: actor.actorId,
        updatedBy: actor.actorId,
      })
      .onConflictDoUpdate({
        target: [
          activityEvent.entityId,
          activityEvent.sourceSystem,
          activityEvent.sourceEventId,
        ],
        set: {
          personId: r.resourceId,
          eventType: raw.eventType,
          occurredAt: new Date(raw.occurredAt),
          hardness: raw.hardness,
          rawPayload: raw.raw,
          resolvedProjectId: r.projectId,
          resolvedClientId: r.clientId,
          resolutionConfidence: resolved ? r.confidence : null,
          matchedBy: r.matchedBy,
          updatedBy: actor.actorId,
          updatedAt: new Date(),
        },
      });

    summary.captured += 1;
    if (raw.hardness === "hard") summary.hard += 1;
    if (r.projectId !== null) summary.resolvedToProject += 1;
    else if (r.clientId !== null) summary.resolvedToClientOnly += 1;
    else summary.unresolved += 1;
  }

  return summary;
}
