"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { indirectCategory, indirectCode } from "@/db/schema";
import { ADMIN_ROLES, assertEntityRole } from "@/lib/auth";
import { formEnum, formRequired, formStr } from "@/lib/form";

export async function createIndirectCode(formData: FormData): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const ctx = await assertEntityRole(entityId, ADMIN_ROLES);
  const code = formRequired(formData, "code", "Code");

  await db.insert(indirectCode).values({
    organizationId: ctx.appUser.organizationId,
    entityId,
    code,
    category: formEnum(
      formData,
      "category",
      indirectCategory.enumValues,
      "overhead",
    ),
    description: formStr(formData, "description"),
    active: true,
    createdBy: ctx.appUser.id,
    updatedBy: ctx.appUser.id,
  });

  revalidatePath("/indirect-codes");
}

export async function updateIndirectCode(formData: FormData): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const codeId = String(formData.get("codeId") ?? "");
  const ctx = await assertEntityRole(entityId, ADMIN_ROLES);
  const code = formRequired(formData, "code", "Code");

  await db
    .update(indirectCode)
    .set({
      code,
      category: formEnum(
        formData,
        "category",
        indirectCategory.enumValues,
        "overhead",
      ),
      description: formStr(formData, "description"),
      updatedBy: ctx.appUser.id,
    })
    .where(
      and(eq(indirectCode.id, codeId), eq(indirectCode.entityId, entityId)),
    );

  revalidatePath("/indirect-codes");
}

export async function setIndirectCodeActive(formData: FormData): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const codeId = String(formData.get("codeId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  const ctx = await assertEntityRole(entityId, ADMIN_ROLES);

  await db
    .update(indirectCode)
    .set({ active, updatedBy: ctx.appUser.id })
    .where(
      and(eq(indirectCode.id, codeId), eq(indirectCode.entityId, entityId)),
    );

  revalidatePath("/indirect-codes");
}
