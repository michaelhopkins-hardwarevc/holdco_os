"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { resource } from "@/db/schema";
import { ADMIN_ROLES, assertEntityRole } from "@/lib/auth";
import { formRequired, formStr } from "@/lib/form";
import { dollarsToCentsOrZero } from "@/lib/money";

export async function createResource(formData: FormData): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const ctx = await assertEntityRole(entityId, ADMIN_ROLES);
  const name = formRequired(formData, "name", "Resource name");

  await db.insert(resource).values({
    organizationId: ctx.appUser.organizationId,
    entityId,
    userId: formStr(formData, "userId"),
    name,
    title: formStr(formData, "title"),
    billRate: dollarsToCentsOrZero(formStr(formData, "billRate")),
    costRate: dollarsToCentsOrZero(formStr(formData, "costRate")),
    targetUtilization: formStr(formData, "targetUtilization"),
    status: "active",
    createdBy: ctx.appUser.id,
    updatedBy: ctx.appUser.id,
  });

  revalidatePath("/resources");
  redirect("/resources");
}

export async function updateResource(formData: FormData): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const resourceId = String(formData.get("resourceId") ?? "");
  const ctx = await assertEntityRole(entityId, ADMIN_ROLES);
  const name = formRequired(formData, "name", "Resource name");

  await db
    .update(resource)
    .set({
      name,
      userId: formStr(formData, "userId"),
      title: formStr(formData, "title"),
      billRate: dollarsToCentsOrZero(formStr(formData, "billRate")),
      costRate: dollarsToCentsOrZero(formStr(formData, "costRate")),
      targetUtilization: formStr(formData, "targetUtilization"),
      updatedBy: ctx.appUser.id,
    })
    .where(and(eq(resource.id, resourceId), eq(resource.entityId, entityId)));

  revalidatePath("/resources");
}

// Deactivating preserves history (soft status flip); reactivating restores it.
export async function setResourceActive(formData: FormData): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const resourceId = String(formData.get("resourceId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  const ctx = await assertEntityRole(entityId, ADMIN_ROLES);

  await db
    .update(resource)
    .set({
      status: active ? "active" : "inactive",
      updatedBy: ctx.appUser.id,
    })
    .where(and(eq(resource.id, resourceId), eq(resource.entityId, entityId)));

  revalidatePath("/resources");
}
