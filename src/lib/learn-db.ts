import { and, eq, isNull } from "drizzle-orm";
import {
  activityEvent,
  auditLog,
  crosswalkParty,
  crosswalkProject,
  project,
  sourceRefRule,
} from "@/db/schema";
import type { CaptureActor } from "@/lib/capture-db";
import type { QueryDb } from "@/lib/queries";
import { parseSourceRef } from "@/lib/source-ref";

// The "tap once, never asks twice" loop (WIS design: an unresolved event goes
// to a queue where a human taps the right project once, and that answer
// becomes a rule). A correction at confirm time, or a mapping made in the
// queue, writes the answer down and re-resolves every event that carried the
// same source ref. Two stores:
//   - crosswalk_project / crosswalk_party: the structural mapping (a board or
//     deal IS this project; a domain IS this client). Written for project
//     answers when the slot is free; never overwritten silently.
//   - source_ref_rule: the explicit per-ref answer (project, indirect, or
//     ignore). Checked first at resolution. This is what makes "that domain is
//     BD" and "ignore gmail.com" possible.

export type LearnTarget =
  | { kind: "project"; projectId: string }
  | { kind: "indirect"; indirectCodeId: string }
  | { kind: "ignore" };

export type LearnOutcome = {
  mapped: string[]; // refs that got a new crosswalk row or rule
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

/** Map a ref structurally to a project (board/deal/folder) or, for an email
 *  domain, to the project's client. Returns whether a new row was written. */
async function mapRefToProjectCrosswalk(
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
      and(eq(crosswalkProject.entityId, entityId), isNull(crosswalkProject.deletedAt)),
    );
  if (all.some((r) => r[column] === parsed.value)) return "skipped";
  const mine = all.find((r) => r.projectId === projectId);
  if (mine) {
    if (mine[column]) return "skipped";
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

/** Write (or refresh) the explicit per-ref rule. Returns false if a rule for
 *  this ref already exists with a different answer (never overwritten here;
 *  delete it on /crosswalks first). */
async function setSourceRefRule(
  db: QueryDb,
  actor: CaptureActor,
  entityId: string,
  ref: string,
  target: LearnTarget,
): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(sourceRefRule)
    .where(
      and(
        eq(sourceRefRule.entityId, entityId),
        eq(sourceRefRule.sourceRef, ref),
        isNull(sourceRefRule.deletedAt),
      ),
    )
    .limit(1);
  const values = {
    kind: target.kind,
    projectId: target.kind === "project" ? target.projectId : null,
    indirectCodeId: target.kind === "indirect" ? target.indirectCodeId : null,
  };
  if (existing) {
    const same =
      existing.kind === values.kind &&
      existing.projectId === values.projectId &&
      existing.indirectCodeId === values.indirectCodeId;
    return same;
  }
  await db
    .insert(sourceRefRule)
    .values({
      organizationId: actor.orgId,
      entityId,
      sourceRef: ref,
      ...values,
      createdBy: actor.actorId,
      updatedBy: actor.actorId,
    })
    .onConflictDoUpdate({
      target: [sourceRefRule.entityId, sourceRefRule.sourceRef],
      set: { ...values, deletedAt: null, updatedBy: actor.actorId },
    });
  return true;
}

/** Re-resolve every still-unplaced event carrying this ref to the answer. */
export async function reResolveByRule(
  db: QueryDb,
  actor: CaptureActor,
  entityId: string,
  ref: string,
  target: LearnTarget,
): Promise<number> {
  const clientId =
    target.kind === "project" ? await projectClient(db, entityId, target.projectId) : null;
  const set =
    target.kind === "project"
      ? {
          resolvedProjectId: target.projectId,
          resolvedClientId: clientId,
          resolvedIndirectCodeId: null,
          resolutionConfidence: "high" as const,
          matchedBy: "rule_project",
        }
      : target.kind === "indirect"
        ? {
            resolvedProjectId: null,
            resolvedIndirectCodeId: target.indirectCodeId,
            resolutionConfidence: "high" as const,
            matchedBy: "rule_indirect",
          }
        : {
            resolvedProjectId: null,
            resolvedClientId: null,
            resolvedIndirectCodeId: null,
            resolutionConfidence: null,
            matchedBy: "ignored",
          };
  const rows = await db
    .update(activityEvent)
    .set({ ...set, updatedBy: actor.actorId })
    .where(
      and(
        eq(activityEvent.entityId, entityId),
        eq(activityEvent.sourceRef, ref),
        isNull(activityEvent.resolvedProjectId),
        isNull(activityEvent.resolvedIndirectCodeId),
        isNull(activityEvent.deletedAt),
      ),
    )
    .returning({ id: activityEvent.id });
  return rows.length;
}

/**
 * Learn from a person's answer for a block's source refs: write the rule (and,
 * for a project answer, the structural crosswalk when its slot is free), then
 * re-resolve unplaced events so the next draft charges them by itself.
 */
export async function learnFromAcceptance(
  db: QueryDb,
  actor: CaptureActor,
  params: { entityId: string; hints: string[]; target: LearnTarget },
): Promise<LearnOutcome> {
  const out: LearnOutcome = { mapped: [], skipped: [], reResolved: 0 };
  const { entityId, target } = params;

  for (const ref of params.hints) {
    if (!parseSourceRef(ref)) continue;
    let wrote = false;
    if (target.kind === "project") {
      const r = await mapRefToProjectCrosswalk(db, actor, entityId, ref, target.projectId);
      if (r === "invalid") continue;
      wrote = r === "mapped";
    }
    // The explicit rule is written for every kind (it is what "indirect" and
    // "ignore" rely on, and it makes a project answer authoritative).
    const ruleOk = await setSourceRefRule(db, actor, entityId, ref, target);
    if (ruleOk) wrote = true;
    if (wrote) {
      out.mapped.push(ref);
      out.reResolved += await reResolveByRule(db, actor, entityId, ref, target);
    } else {
      out.skipped.push(ref);
    }
  }

  if (out.mapped.length > 0) {
    await db.insert(auditLog).values({
      organizationId: actor.orgId,
      entityId,
      tableName: "source_ref_rule",
      recordId: entityId,
      action: "learn",
      actorId: actor.actorId,
      after: { target, mapped: out.mapped, reResolved: out.reResolved },
    });
  }
  return out;
}

/** Queue action: place one ref (project, indirect, or ignore). */
export async function mapSourceRef(
  db: QueryDb,
  actor: CaptureActor,
  entityId: string,
  ref: string,
  target: LearnTarget,
): Promise<LearnOutcome> {
  return learnFromAcceptance(db, actor, { entityId, hints: [ref], target });
}

/** Back-compat for the earlier project-only API. */
export async function mapSourceRefToProject(
  db: QueryDb,
  actor: CaptureActor,
  entityId: string,
  ref: string,
  projectId: string,
): Promise<LearnOutcome> {
  return mapSourceRef(db, actor, entityId, ref, { kind: "project", projectId });
}
