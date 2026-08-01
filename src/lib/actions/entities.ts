"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { entity } from "@/db/schema";
import { entityType } from "@/db/schema";
import { membership } from "@/db/schema";
import { setActiveEntityId } from "@/lib/active-entity";
import { ADMIN_ROLES, assertEntityRole, requireContext } from "@/lib/auth";

function parseEntityType(value: FormDataEntryValue | null) {
  const v = String(value ?? "services");
  return (entityType.enumValues as readonly string[]).includes(v)
    ? (v as (typeof entityType.enumValues)[number])
    : "services";
}

// Create a new entity. Any signed-in user may create one (bootstrap) and
// becomes its owner.
export async function createEntity(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Entity name is required.");
  const legalName = String(formData.get("legalName") ?? "").trim() || null;
  const type = parseEntityType(formData.get("type"));
  const orgId = ctx.appUser.organizationId;

  const [created] = await db
    .insert(entity)
    .values({
      organizationId: orgId,
      name,
      legalName,
      type,
      createdBy: ctx.appUser.id,
      updatedBy: ctx.appUser.id,
    })
    .returning({ id: entity.id });

  await db.insert(membership).values({
    organizationId: orgId,
    entityId: created.id,
    userId: ctx.appUser.id,
    role: "owner",
    createdBy: ctx.appUser.id,
    updatedBy: ctx.appUser.id,
  });

  await setActiveEntityId(created.id);
  revalidatePath("/", "layout");
  redirect(`/entities/${created.id}`);
}

// Edit an entity's details. Owner/admin only.
export async function updateEntity(formData: FormData): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const ctx = await assertEntityRole(entityId, ADMIN_ROLES);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Entity name is required.");
  const legalName = String(formData.get("legalName") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "active").trim() || "active";

  await db
    .update(entity)
    .set({ name, legalName, status, updatedBy: ctx.appUser.id })
    .where(eq(entity.id, entityId));

  revalidatePath("/", "layout");
  revalidatePath(`/entities/${entityId}`);
}
