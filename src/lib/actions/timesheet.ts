"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { resource } from "@/db/schema";
import {
  assertEntityRole,
  getEntityRole,
  MANAGER_ROLES,
  requireContext,
} from "@/lib/auth";
import {
  applyTimesheet,
  submitTimesheetWeek,
  transitionTimesheetWeek,
} from "@/lib/timesheet-db";
import type { SaveTimesheetInput } from "@/lib/timesheet";

// Caller may edit a timesheet if it's their own resource, or they're a manager.
async function authorizeTimesheet(entityId: string, resourceId: string) {
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
    throw new Error("You are not allowed to edit this timesheet.");
  }
  return { ctx, res };
}

export async function saveTimesheet(input: SaveTimesheetInput): Promise<void> {
  const { ctx, res } = await authorizeTimesheet(input.entityId, input.resourceId);
  await applyTimesheet(
    db,
    { orgId: ctx.appUser.organizationId, actorId: ctx.appUser.id },
    { billRate: res.billRate, costRate: res.costRate },
    input,
  );
  revalidatePath("/timesheet");
}

export async function submitWeek(formData: FormData): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const resourceId = String(formData.get("resourceId") ?? "");
  const weekStart = String(formData.get("weekStart") ?? "");
  const { ctx } = await authorizeTimesheet(entityId, resourceId);
  await submitTimesheetWeek(
    db,
    { orgId: ctx.appUser.organizationId, actorId: ctx.appUser.id },
    entityId,
    resourceId,
    weekStart,
  );
  revalidatePath("/timesheet");
  revalidatePath("/approvals");
}

async function reviewWeek(
  formData: FormData,
  to: "approved" | "draft",
  action: "approve" | "reject",
): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const resourceId = String(formData.get("resourceId") ?? "");
  const weekStart = String(formData.get("weekStart") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  const ctx = await assertEntityRole(entityId, MANAGER_ROLES);
  await transitionTimesheetWeek(
    db,
    { orgId: ctx.appUser.organizationId, actorId: ctx.appUser.id },
    entityId,
    resourceId,
    weekStart,
    to,
    action,
    note,
  );
  revalidatePath("/approvals");
  revalidatePath("/timesheet");
}

export async function approveWeek(formData: FormData): Promise<void> {
  await reviewWeek(formData, "approved", "approve");
}

export async function rejectWeek(formData: FormData): Promise<void> {
  await reviewWeek(formData, "draft", "reject");
}
