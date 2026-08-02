"use server";

import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { indirectCode, phase, project, resource, signal } from "@/db/schema";
import { getEntityRole, MANAGER_ROLES, requireContext } from "@/lib/auth";
import {
  acceptOpenSignals,
  acceptSignal,
  type ChargeOverride,
  dismissSignal,
} from "@/lib/signals-db";
import { getWeek } from "@/lib/timesheet";

// Parse the "charge" the user picked: "project:<projectId>:<phaseId?>" or
// "indirect:<codeId>". Returns undefined to fall back to the signal's guess.
function parseCharge(value: string): ChargeOverride | undefined {
  const [kind, a, b] = value.split(":");
  if (kind === "project" && a) {
    return { chargeType: "project", projectId: a, phaseId: b || null, indirectCodeId: null };
  }
  if (kind === "indirect" && a) {
    return { chargeType: "indirect", projectId: null, phaseId: null, indirectCodeId: a };
  }
  return undefined;
}

type Signal = typeof signal.$inferSelect;

// Accept/dismiss are allowed for the resource's own user, or a manager+.
async function loadResourceAuthorized(entityId: string, resourceId: string) {
  const ctx = await requireContext();
  const role = await getEntityRole(ctx.appUser.id, entityId);
  if (!role) throw new Error("You are not a member of this entity.");
  const [res] = await db
    .select()
    .from(resource)
    .where(and(eq(resource.id, resourceId), eq(resource.entityId, entityId)))
    .limit(1);
  if (!res) throw new Error("Resource not found.");
  if (res.userId !== ctx.appUser.id && !MANAGER_ROLES.includes(role)) {
    throw new Error("You are not allowed to act on this timesheet.");
  }
  return { ctx, res };
}

function actorOf(ctx: Awaited<ReturnType<typeof loadResourceAuthorized>>["ctx"]) {
  return { orgId: ctx.appUser.organizationId, actorId: ctx.appUser.id };
}

async function loadSignal(signalId: string): Promise<Signal> {
  const [sig] = await db.select().from(signal).where(eq(signal.id, signalId)).limit(1);
  if (!sig) throw new Error("Signal not found.");
  return sig;
}

export async function acceptSignalAction(formData: FormData): Promise<void> {
  const sig = await loadSignal(String(formData.get("signalId") ?? ""));
  const { ctx, res } = await loadResourceAuthorized(sig.entityId, sig.resourceId);
  const override = parseCharge(String(formData.get("charge") ?? ""));
  await acceptSignal(
    db,
    actorOf(ctx),
    { billRate: res.billRate, costRate: res.costRate },
    sig,
    override,
  );
  revalidatePath("/timesheet");
}

export async function dismissSignalAction(formData: FormData): Promise<void> {
  const sig = await loadSignal(String(formData.get("signalId") ?? ""));
  const { ctx } = await loadResourceAuthorized(sig.entityId, sig.resourceId);
  await dismissSignal(db, actorOf(ctx), sig);
  revalidatePath("/timesheet");
}

async function openSignalsForWeek(
  entityId: string,
  resourceId: string,
  weekStart: string,
): Promise<Signal[]> {
  const week = getWeek(weekStart);
  return db
    .select()
    .from(signal)
    .where(
      and(
        eq(signal.entityId, entityId),
        eq(signal.resourceId, resourceId),
        eq(signal.state, "open"),
        gte(signal.workDate, week.start),
        lte(signal.workDate, week.end),
        isNull(signal.deletedAt),
      ),
    );
}

export async function acceptAllSignalsAction(formData: FormData): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const resourceId = String(formData.get("resourceId") ?? "");
  const weekStart = String(formData.get("weekStart") ?? "");
  const { ctx, res } = await loadResourceAuthorized(entityId, resourceId);
  const open = await openSignalsForWeek(entityId, resourceId, weekStart);
  await acceptOpenSignals(db, actorOf(ctx), { billRate: res.billRate, costRate: res.costRate }, open);
  revalidatePath("/timesheet");
}

export async function dismissAllSignalsAction(formData: FormData): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const resourceId = String(formData.get("resourceId") ?? "");
  const weekStart = String(formData.get("weekStart") ?? "");
  const { ctx } = await loadResourceAuthorized(entityId, resourceId);
  const open = await openSignalsForWeek(entityId, resourceId, weekStart);
  for (const sig of open) {
    await dismissSignal(db, actorOf(ctx), sig);
  }
  revalidatePath("/timesheet");
}

// Demo helper: seed a few sample signals so the flow is usable before any real
// provider is connected. Replaced by live providers later.
export async function generateSampleSignals(formData: FormData): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const resourceId = String(formData.get("resourceId") ?? "");
  const weekStart = String(formData.get("weekStart") ?? "");
  const { ctx } = await loadResourceAuthorized(entityId, resourceId);
  const week = getWeek(weekStart);

  const [proj] = await db
    .select()
    .from(project)
    .where(and(eq(project.entityId, entityId), isNull(project.deletedAt)))
    .limit(1);
  const [ph] = proj
    ? await db
        .select()
        .from(phase)
        .where(and(eq(phase.projectId, proj.id), isNull(phase.deletedAt)))
        .limit(1)
    : [];
  const [ind] = await db
    .select()
    .from(indirectCode)
    .where(
      and(
        eq(indirectCode.entityId, entityId),
        eq(indirectCode.active, true),
        isNull(indirectCode.deletedAt),
      ),
    )
    .limit(1);

  if (!proj || !ph) {
    throw new Error(
      "Create a project with at least one phase first so sample signals have something to charge to.",
    );
  }

  const base = {
    organizationId: ctx.appUser.organizationId,
    entityId,
    resourceId,
    provider: "outlook",
    state: "open" as const,
    createdBy: ctx.appUser.id,
    updatedBy: ctx.appUser.id,
  };

  const rows: (typeof signal.$inferInsert)[] = [
    {
      ...base,
      workDate: week.days[0],
      externalId: `sample-${week.start}-1`,
      evidence: `Design review · ${proj.name}`,
      provenance: `${week.days[0]} · 1h 30m in meeting`,
      chargeType: "project" as const,
      projectId: proj.id,
      phaseId: ph.id,
      indirectCodeId: null,
      proposedHours: "1.50",
      confidence: "high" as const,
      billable: true,
    },
    {
      ...base,
      provider: "linear",
      workDate: week.days[1],
      externalId: `sample-${week.start}-2`,
      evidence: `8 issues progressed in ${proj.code}`,
      provenance: `${week.days[1]} · dev activity`,
      chargeType: "project" as const,
      projectId: proj.id,
      phaseId: ph.id,
      indirectCodeId: null,
      proposedHours: "3.00",
      confidence: "med" as const,
      billable: true,
    },
  ];

  if (ind) {
    rows.push({
      ...base,
      workDate: week.days[2],
      externalId: `sample-${week.start}-3`,
      evidence: "Team standup and 1:1s",
      provenance: `${week.days[2]} · meetings`,
      chargeType: "indirect" as const,
      projectId: null,
      phaseId: null,
      indirectCodeId: ind.id,
      proposedHours: "1.00",
      confidence: "high" as const,
      billable: false,
    });
  }

  await db.insert(signal).values(rows).onConflictDoNothing();
  revalidatePath("/timesheet");
}
