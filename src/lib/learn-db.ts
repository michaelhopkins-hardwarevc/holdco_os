import { and, eq, isNull } from "drizzle-orm";
import {
  activityEvent,
  auditLog,
  crosswalkParty,
  crosswalkProject,
  project,
} from "@/db/schema";
import type { CaptureActor } from "@/lib/capture-db";
import type { QueryDb } from "@/lib/queries";
import { parseSourceRef } from "@/lib/source-ref";

// The "tap once, never asks twice" loop (WIS design: an unresolved event goes
// to a queue where a human taps the right project once, and that answer
// becomes a rule). A correction at confirm time, or a mapping made in the
// queue, writes a crosswalk row for the source ref and re-resolves every event
// that carried it. Existing mappings are never overwritten silently: a ref that
// already points somewhere is left alone (the queue shows it for review).

export type LearnOutcome = {
  mapped: string[]; // refs that became a new crosswalk row
  skipped: string[]; // refs already mapped elsewhere (left as they were)
  reResolved: number; // activity events updated
};

async function projectClient(db: QueryDb, entityId: string, projectId: string) {
  const [p] = await db
    .select({ clientId: project.clientId })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.entityId, entityId)))
    .limit(1);
  return p?.clientId ?? null;
}

/**
 * Map one source ref to a project (board/deal/folder refs) or, for an email
 * domain, to the project's client. Returns whether a new mapping was written.
 */
async function mapRefToProject(
  db: QueryDb,
  actor: CaptureActor,
  entityId: string,
  ref: string,
  projectId: string,
): Promise<"mapped" | "skipped" | "invalid"> {
  const parsed = parseSourceRef(ref);
  if (!parsed) return "invalid";
  const clientId = await projectClient(db, entityId, projectId);
  if (!clientId) return "invalid";

  if (parsed.kind === "email_domain") {
    // A domain identifies a client, not a project. Map it to the project's
    // client unless the domain already maps somewhere.
    const [existing] = await db
      .select({ clientId: crosswalkParty.clientId })
      .from(crosswalkParty)
      .where(
        and(
          eq(crosswalkParty.entityId, entityId),
          eq(crosswalkParty.matchType, "email_domain"),
          eq(crosswalkParty.matchValue, parsed.value),
          isNull(crosswalkParty.deletedAt),
        ),
      )
      .limit(1);
    if (existing) return "skipped";
    await db.insert(crosswalkParty).values({
      organizationId: actor.orgId,
      entityId,
      matchType: "email_domain",
      matchValue: parsed.value,
      clientId,
      createdBy: actor.actorId,
      updatedBy: actor.actorId,
    });
    return "mapped";
  }

  // Board / deal / folder: one crosswalk row per project; set the matching
  // column if it is empty. If another project already claims this ref, skip.
  const column =
    parsed.kind === "monday_board"
      ? "mondayBoardId"
      : parsed.kind === "hubspot_deal"
        ? "hubspotDealId"
        : "sharepointFolder";
  const all = await db
    .select()
    .from(crosswalkProject)
    .where(
      and(
        eq(crosswalkProject.entityId, entityId),
        isNull(crosswalkProject.deletedAt),
      ),
    );
  const claimed = all.find((r) => r[column] === parsed.value);
  if (claimed) return claimed.projectId === projectId ? "skipped" : "skipped";

  const mine = all.find((r) => r.projectId === projectId);
  if (mine) {
    if (mine[column]) return "skipped"; // already points at a different ref
    await db
      .update(crosswalkProject)
      .set({ [column]: parsed.value, updatedBy: actor.actorId })
      .where(eq(crosswalkProject.id, mine.id));
  } else {
    await db.insert(crosswalkProject).values({
      organizationId: actor.orgId,
      entityId,
      projectId,
      clientId,
      [column]: parsed.value,
      createdBy: actor.actorId,
      updatedBy: actor.actorId,
    });
  }
  return "mapped";
}

const MATCHED_BY: Record<string, { matchedBy: string; confidence: "high" | "med" }> = {
  monday_board: { matchedBy: "monday_board", confidence: "high" },
  hubspot_deal: { matchedBy: "hubspot_deal", confidence: "high" },
  sharepoint: { matchedBy: "sharepoint_folder", confidence: "high" },
  email_domain: { matchedBy: "email_domain", confidence: "med" },
};

/** Re-resolve every still-unresolved event carrying this ref. */
export async function reResolveByRef(
  db: QueryDb,
  actor: CaptureActor,
  entityId: string,
  ref: string,
  target: { projectId: string | null; clientId: string },
): Promise<number> {
  const parsed = parseSourceRef(ref);
  if (!parsed) return 0;
  const m = MATCHED_BY[parsed.kind];
  const rows = await db
    .update(activityEvent)
    .set({
      resolvedProjectId: target.projectId,
      resolvedClientId: target.clientId,
      resolutionConfidence: m.confidence,
      matchedBy: m.matchedBy,
      updatedBy: actor.actorId,
    })
    .where(
      and(
        eq(activityEvent.entityId, entityId),
        eq(activityEvent.sourceRef, ref),
        isNull(activityEvent.resolvedProjectId),
        isNull(activityEvent.deletedAt),
      ),
    )
    .returning({ id: activityEvent.id });
  return rows.length;
}

/**
 * Learn from a person confirming a block to a project: each of the block's
 * source refs becomes a crosswalk row (if free), and unresolved events carrying
 * those refs are re-resolved so the next draft charges them by itself.
 */
export async function learnFromAcceptance(
  db: QueryDb,
  actor: CaptureActor,
  params: { entityId: string; hints: string[]; projectId: string },
): Promise<LearnOutcome> {
  const out: LearnOutcome = { mapped: [], skipped: [], reResolved: 0 };
  const clientId = await projectClient(db, params.entityId, params.projectId);
  if (!clientId) return out;

  for (const ref of params.hints) {
    const r = await mapRefToProject(db, actor, params.entityId, ref, params.projectId);
    if (r === "mapped") {
      out.mapped.push(ref);
      const parsed = parseSourceRef(ref)!;
      out.reResolved += await reResolveByRef(db, actor, params.entityId, ref, {
        // A domain reaches the client only; ids reach the project.
        projectId: parsed.kind === "email_domain" ? null : params.projectId,
        clientId,
      });
    } else if (r === "skipped") {
      out.skipped.push(ref);
    }
  }

  if (out.mapped.length > 0) {
    await db.insert(auditLog).values({
      organizationId: actor.orgId,
      entityId: params.entityId,
      tableName: "crosswalk",
      recordId: params.projectId,
      action: "learn",
      actorId: actor.actorId,
      after: { mapped: out.mapped, reResolved: out.reResolved },
    });
  }
  return out;
}

/** Queue action: map a ref straight to a project (same rules as learning). */
export async function mapSourceRefToProject(
  db: QueryDb,
  actor: CaptureActor,
  entityId: string,
  ref: string,
  projectId: string,
): Promise<LearnOutcome> {
  return learnFromAcceptance(db, actor, { entityId, hints: [ref], projectId });
}
