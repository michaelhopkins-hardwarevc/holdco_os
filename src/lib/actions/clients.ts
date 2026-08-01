"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { client, contact } from "@/db/schema";
import { assertEntityRole, MANAGER_ROLES } from "@/lib/auth";
import { formRequired, formStr } from "@/lib/form";

export async function createClient(formData: FormData): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const ctx = await assertEntityRole(entityId, MANAGER_ROLES);
  const name = formRequired(formData, "name", "Client name");

  const [created] = await db
    .insert(client)
    .values({
      organizationId: ctx.appUser.organizationId,
      entityId,
      name,
      billingTerms: formStr(formData, "billingTerms"),
      address: formStr(formData, "address"),
      notes: formStr(formData, "notes"),
      createdBy: ctx.appUser.id,
      updatedBy: ctx.appUser.id,
    })
    .returning({ id: client.id });

  revalidatePath("/clients");
  redirect(`/clients/${created.id}`);
}

export async function updateClient(formData: FormData): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  const ctx = await assertEntityRole(entityId, MANAGER_ROLES);
  const name = formRequired(formData, "name", "Client name");

  await db
    .update(client)
    .set({
      name,
      status: formStr(formData, "status") ?? "active",
      billingTerms: formStr(formData, "billingTerms"),
      address: formStr(formData, "address"),
      notes: formStr(formData, "notes"),
      updatedBy: ctx.appUser.id,
    })
    .where(and(eq(client.id, clientId), eq(client.entityId, entityId)));

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
}

export async function createContact(formData: FormData): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  const ctx = await assertEntityRole(entityId, MANAGER_ROLES);
  const name = formRequired(formData, "name", "Contact name");

  await db.insert(contact).values({
    organizationId: ctx.appUser.organizationId,
    entityId,
    clientId,
    name,
    email: formStr(formData, "email"),
    phone: formStr(formData, "phone"),
    role: formStr(formData, "role"),
    createdBy: ctx.appUser.id,
    updatedBy: ctx.appUser.id,
  });

  revalidatePath(`/clients/${clientId}`);
}
