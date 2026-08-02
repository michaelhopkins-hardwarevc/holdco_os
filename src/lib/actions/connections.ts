"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { indirectCode, project, resource, signal } from "@/db/schema";
import { getEntityRole, requireContext } from "@/lib/auth";
import { outlookProvider } from "@/lib/integrations/outlook";
import {
  disconnectOutlook as disconnectOutlookConn,
  freshOutlookAccessToken,
  getOutlookConnection,
} from "@/lib/integrations/outlook-store";
import { eventsToSignals } from "@/lib/signals-map";
import { addWeeks, getWeek } from "@/lib/timesheet";

async function requireMember(entityId: string) {
  const ctx = await requireContext();
  const role = await getEntityRole(ctx.appUser.id, entityId);
  if (!role) throw new Error("You are not a member of this entity.");
  return ctx;
}

// Pull the current user's Outlook calendar for the week and turn events into
// open signals (idempotent — prior accepted/dismissed signals are untouched).
export async function syncOutlook(formData: FormData): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const resourceId = String(formData.get("resourceId") ?? "");
  const weekStart = String(formData.get("weekStart") ?? "");
  const ctx = await requireMember(entityId);

  const [res] = await db
    .select()
    .from(resource)
    .where(and(eq(resource.id, resourceId), eq(resource.entityId, entityId)))
    .limit(1);
  if (!res) throw new Error("Resource not found.");
  if (res.userId !== ctx.appUser.id) {
    throw new Error("You can only sync your own calendar.");
  }

  const conn = await getOutlookConnection(entityId, ctx.appUser.id);
  if (!conn) {
    throw new Error("Connect Outlook first (Connections).");
  }

  const accessToken = await freshOutlookAccessToken(conn);
  const week = getWeek(weekStart);
  const startISO = `${week.start}T00:00:00Z`;
  const endISO = `${addWeeks(week.start, 1)}T00:00:00Z`;
  const events = await outlookProvider.listEvents(accessToken, startISO, endISO);

  const projects = await db
    .select({ id: project.id, code: project.code, name: project.name })
    .from(project)
    .where(and(eq(project.entityId, entityId), isNull(project.deletedAt)));
  const codes = await db
    .select({
      id: indirectCode.id,
      code: indirectCode.code,
      category: indirectCode.category,
    })
    .from(indirectCode)
    .where(
      and(
        eq(indirectCode.entityId, entityId),
        eq(indirectCode.active, true),
        isNull(indirectCode.deletedAt),
      ),
    );

  const mapped = eventsToSignals(events, { projects, indirectCodes: codes });
  if (mapped.length > 0) {
    await db
      .insert(signal)
      .values(
        mapped.map((m) => ({
          organizationId: ctx.appUser.organizationId,
          entityId,
          resourceId,
          provider: "outlook",
          state: "open" as const,
          createdBy: ctx.appUser.id,
          updatedBy: ctx.appUser.id,
          ...m,
        })),
      )
      .onConflictDoNothing();
  }

  revalidatePath("/timesheet");
  revalidatePath("/connections");
}

export async function disconnectOutlook(formData: FormData): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const ctx = await requireMember(entityId);

  await disconnectOutlookConn(entityId, ctx.appUser.id);

  // Privacy: drop this user's still-open Outlook signals for the entity.
  const [res] = await db
    .select({ id: resource.id })
    .from(resource)
    .where(
      and(
        eq(resource.entityId, entityId),
        eq(resource.userId, ctx.appUser.id),
        isNull(resource.deletedAt),
      ),
    )
    .limit(1);
  if (res) {
    await db
      .update(signal)
      .set({ deletedAt: new Date(), updatedBy: ctx.appUser.id })
      .where(
        and(
          eq(signal.resourceId, res.id),
          eq(signal.provider, "outlook"),
          eq(signal.state, "open"),
          isNull(signal.deletedAt),
        ),
      );
  }

  revalidatePath("/connections");
  revalidatePath("/timesheet");
}
