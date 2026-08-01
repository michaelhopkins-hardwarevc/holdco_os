"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { phase, project, projectStatus, projectType } from "@/db/schema";
import { assertEntityRole, MANAGER_ROLES } from "@/lib/auth";
import { formEnum, formInt, formRequired, formStr } from "@/lib/form";
import { dollarsToCents } from "@/lib/money";

export async function createProject(formData: FormData): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const ctx = await assertEntityRole(entityId, MANAGER_ROLES);
  const clientId = formRequired(formData, "clientId", "Client");
  const code = formRequired(formData, "code", "Project code");
  const name = formRequired(formData, "name", "Project name");

  const [created] = await db
    .insert(project)
    .values({
      organizationId: ctx.appUser.organizationId,
      entityId,
      clientId,
      code,
      name,
      type: formEnum(formData, "type", projectType.enumValues, "time_materials"),
      status: formEnum(formData, "status", projectStatus.enumValues, "active"),
      contractValue: dollarsToCents(formStr(formData, "contractValue")),
      projectManagerId: formStr(formData, "projectManagerId"),
      startDate: formStr(formData, "startDate"),
      endDate: formStr(formData, "endDate"),
      notes: formStr(formData, "notes"),
      createdBy: ctx.appUser.id,
      updatedBy: ctx.appUser.id,
    })
    .returning({ id: project.id });

  revalidatePath("/projects");
  redirect(`/projects/${created.id}`);
}

export async function updateProject(formData: FormData): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const ctx = await assertEntityRole(entityId, MANAGER_ROLES);
  const name = formRequired(formData, "name", "Project name");

  await db
    .update(project)
    .set({
      name,
      type: formEnum(formData, "type", projectType.enumValues, "time_materials"),
      status: formEnum(formData, "status", projectStatus.enumValues, "active"),
      contractValue: dollarsToCents(formStr(formData, "contractValue")),
      projectManagerId: formStr(formData, "projectManagerId"),
      startDate: formStr(formData, "startDate"),
      endDate: formStr(formData, "endDate"),
      notes: formStr(formData, "notes"),
      updatedBy: ctx.appUser.id,
    })
    .where(and(eq(project.id, projectId), eq(project.entityId, entityId)));

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
}

export async function createPhase(formData: FormData): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const ctx = await assertEntityRole(entityId, MANAGER_ROLES);
  const name = formRequired(formData, "name", "Phase name");

  await db.insert(phase).values({
    organizationId: ctx.appUser.organizationId,
    entityId,
    projectId,
    name,
    code: formStr(formData, "code"),
    budgetHours: formStr(formData, "budgetHours"),
    budgetAmount: dollarsToCents(formStr(formData, "budgetAmount")),
    sortOrder: formInt(formData, "sortOrder", 0),
    createdBy: ctx.appUser.id,
    updatedBy: ctx.appUser.id,
  });

  revalidatePath(`/projects/${projectId}`);
}
