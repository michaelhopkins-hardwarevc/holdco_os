"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { resource, signal } from "@/db/schema";
import { ADMIN_ROLES, getEntityRole, requireContext } from "@/lib/auth";
import { syncUserOutlook } from "@/lib/capture-service";
import { disconnectOutlook as disconnectOutlookConn } from "@/lib/integrations/outlook-store";
import { disconnectXero as disconnectXeroConn } from "@/lib/integrations/xero-store";
import { addWeeks, getWeek } from "@/lib/timesheet";

async function requireMember(entityId: string) {
  const ctx = await requireContext();
  const role = await getEntityRole(ctx.appUser.id, entityId);
  if (!role) throw new Error("You are not a member of this entity.");
  return ctx;
}

// Refresh the current user's Outlook (mail + calendar) for the week through the
// unified capture pipeline: land activity_events, resolve (incl. subject->
// project matching + learned rules), and draft them into confirmable signals.
export async function syncOutlook(formData: FormData): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const weekStart = String(formData.get("weekStart") ?? "");
  const ctx = await requireMember(entityId);
  const week = getWeek(weekStart);
  const range = {
    start: `${week.start}T00:00:00Z`,
    end: `${addWeeks(week.start, 1)}T00:00:00Z`,
  };

  // Collect an outcome, then redirect with it (redirect() must be outside the
  // try/catch, since it works by throwing).
  let outcome: { ok: true; drafted: number } | { ok: false; error: string };
  try {
    const { drafted } = await syncUserOutlook(entityId, ctx.appUser.id, range);
    outcome = { ok: true, drafted: drafted.blocks };
  } catch (e) {
    outcome = {
      ok: false,
      error: e instanceof Error ? e.message : "Sync failed.",
    };
  }

  const params = new URLSearchParams({ week: week.start });
  if (outcome.ok) {
    params.set("syncDrafted", String(outcome.drafted));
  } else {
    params.set("syncError", outcome.error.slice(0, 300));
  }
  redirect(`/timesheet?${params.toString()}`);
}

// Disconnect the firm's Xero organisation (admin/owner only).
export async function disconnectXero(formData: FormData): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const ctx = await requireMember(entityId);
  const role = await getEntityRole(ctx.appUser.id, entityId);
  if (!role || !ADMIN_ROLES.includes(role)) {
    throw new Error("Only an admin can disconnect Xero.");
  }
  await disconnectXeroConn(entityId, ctx.appUser.id);
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
