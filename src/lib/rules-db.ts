import { and, eq, sql } from "drizzle-orm";
import { signalRule } from "@/db/schema";
import type { QueryDb } from "@/lib/queries";
import { normalizeSubject, type RuleCharge } from "@/lib/signals-map";
import type { Actor } from "@/lib/timesheet-db";

// Record/reinforce a learned rule from an accepted signal: "events whose
// subject normalizes to this value charge here." Reinforcing bumps hit_count.
export async function recordRule(
  db: QueryDb,
  actor: Actor,
  params: {
    entityId: string;
    resourceId: string;
    subject: string;
    charge: RuleCharge;
  },
): Promise<void> {
  const matchValue = normalizeSubject(params.subject);
  if (!matchValue) return;
  const c = params.charge;
  if (c.chargeType === "project" && !c.projectId) return;
  if (c.chargeType === "indirect" && !c.indirectCodeId) return;

  const projectId = c.chargeType === "project" ? c.projectId : null;
  const phaseId = c.chargeType === "project" ? c.phaseId : null;
  const indirectCodeId = c.chargeType === "indirect" ? c.indirectCodeId : null;

  await db
    .insert(signalRule)
    .values({
      organizationId: actor.orgId,
      entityId: params.entityId,
      resourceId: params.resourceId,
      matchValue,
      chargeType: c.chargeType,
      projectId,
      phaseId,
      indirectCodeId,
      hitCount: 1,
      createdBy: actor.actorId,
      updatedBy: actor.actorId,
    })
    .onConflictDoUpdate({
      target: [signalRule.resourceId, signalRule.matchValue],
      set: {
        chargeType: c.chargeType,
        projectId,
        phaseId,
        indirectCodeId,
        hitCount: sql`${signalRule.hitCount} + 1`,
        deletedAt: null,
        updatedBy: actor.actorId,
      },
    });
}

export async function deleteRule(
  db: QueryDb,
  actor: Actor,
  ruleId: string,
  entityId: string,
  resourceId: string,
): Promise<void> {
  await db
    .update(signalRule)
    .set({ deletedAt: new Date(), updatedBy: actor.actorId })
    .where(
      and(
        eq(signalRule.id, ruleId),
        eq(signalRule.entityId, entityId),
        eq(signalRule.resourceId, resourceId),
      ),
    );
}
