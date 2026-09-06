"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  crosswalkParty,
  crosswalkPerson,
  crosswalkProject,
  project,
} from "@/db/schema";
import { assertEntityRole, MANAGER_ROLES } from "@/lib/auth";
import { normalizeDomain, normalizeName } from "@/lib/crosswalk-map";
import { draftForEntity } from "@/lib/draft-db";
import { formEnum, formRequired, formStr } from "@/lib/form";
import { mapSourceRefToProject } from "@/lib/learn-db";

// Crosswalks are reference data (no money): manager/admin/owner may edit them.
async function requireManager(entityId: string) {
  const ctx = await assertEntityRole(entityId, MANAGER_ROLES);
  return { orgId: ctx.appUser.organizationId, actorId: ctx.appUser.id };
}

const PATHS = ["/queue", "/crosswalks", "/timesheet", "/connections"];
function refresh() {
  for (const p of PATHS) revalidatePath(p);
}

// Re-draft the last week for the entity after a mapping so newly resolved
// events show up pre-charged on the timesheet without waiting for the cron.
async function redraftRecent(entityId: string, actor: { orgId: string; actorId: string }) {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 86_400_000);
  await draftForEntity(db, actor, entityId, {
    start: start.toISOString(),
    end: end.toISOString(),
  });
}

/** Queue: map one unresolved source ref to a project (learns + re-resolves). */
export async function mapRefToProjectAction(formData: FormData): Promise<void> {
  const entityId = formRequired(formData, "entityId", "Entity");
  const ref = formRequired(formData, "ref", "Source");
  const projectId = formRequired(formData, "projectId", "Project");
  const actor = await requireManager(entityId);
  await mapSourceRefToProject(db, actor, entityId, ref, projectId);
  await redraftRecent(entityId, actor);
  refresh();
}

export async function addPersonCrosswalk(formData: FormData): Promise<void> {
  const entityId = formRequired(formData, "entityId", "Entity");
  const actor = await requireManager(entityId);
  const sourceSystem = formEnum(
    formData,
    "sourceSystem",
    ["microsoft", "google", "monday", "hubspot"] as const,
    "monday",
  );
  const sourceUserId = formRequired(formData, "sourceUserId", "External user id");
  const resourceId = formRequired(formData, "resourceId", "Person");
  await db
    .insert(crosswalkPerson)
    .values({
      organizationId: actor.orgId,
      entityId,
      sourceSystem,
      sourceUserId,
      resourceId,
      createdBy: actor.actorId,
      updatedBy: actor.actorId,
    })
    .onConflictDoUpdate({
      target: [crosswalkPerson.entityId, crosswalkPerson.sourceSystem, crosswalkPerson.sourceUserId],
      set: { resourceId, deletedAt: null, updatedBy: actor.actorId },
    });
  refresh();
}

export async function addPartyCrosswalk(formData: FormData): Promise<void> {
  const entityId = formRequired(formData, "entityId", "Entity");
  const actor = await requireManager(entityId);
  const matchType = formEnum(formData, "matchType", ["email_domain", "name_variant"] as const, "email_domain");
  const raw = formRequired(formData, "matchValue", "Value");
  const matchValue = matchType === "email_domain" ? normalizeDomain(raw) : normalizeName(raw);
  const clientId = formRequired(formData, "clientId", "Client");
  await db
    .insert(crosswalkParty)
    .values({
      organizationId: actor.orgId,
      entityId,
      matchType,
      matchValue,
      clientId,
      createdBy: actor.actorId,
      updatedBy: actor.actorId,
    })
    .onConflictDoUpdate({
      target: [crosswalkParty.entityId, crosswalkParty.matchType, crosswalkParty.matchValue],
      set: { clientId, deletedAt: null, updatedBy: actor.actorId },
    });
  await redraftRecent(entityId, actor);
  refresh();
}

export async function upsertProjectCrosswalk(formData: FormData): Promise<void> {
  const entityId = formRequired(formData, "entityId", "Entity");
  const actor = await requireManager(entityId);
  const projectId = formRequired(formData, "projectId", "Project");
  const [p] = await db
    .select({ clientId: project.clientId })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.entityId, entityId)))
    .limit(1);
  if (!p) throw new Error("Project not found.");
  const values = {
    mondayBoardId: formStr(formData, "mondayBoardId"),
    hubspotDealId: formStr(formData, "hubspotDealId"),
    sharepointFolder: formStr(formData, "sharepointFolder"),
    xeroTrackingOption: formStr(formData, "xeroTrackingOption"),
  };
  await db
    .insert(crosswalkProject)
    .values({
      organizationId: actor.orgId,
      entityId,
      projectId,
      clientId: p.clientId,
      ...values,
      createdBy: actor.actorId,
      updatedBy: actor.actorId,
    })
    .onConflictDoUpdate({
      target: [crosswalkProject.entityId, crosswalkProject.projectId],
      set: { clientId: p.clientId, ...values, deletedAt: null, updatedBy: actor.actorId },
    });
  await redraftRecent(entityId, actor);
  refresh();
}

export async function deleteCrosswalk(formData: FormData): Promise<void> {
  const entityId = formRequired(formData, "entityId", "Entity");
  const kind = formEnum(formData, "kind", ["person", "party", "project"] as const, "person");
  const id = formRequired(formData, "id", "Row");
  const actor = await requireManager(entityId);
  const table =
    kind === "person" ? crosswalkPerson : kind === "party" ? crosswalkParty : crosswalkProject;
  await db
    .update(table)
    .set({ deletedAt: new Date(), updatedBy: actor.actorId })
    .where(and(eq(table.id, id), eq(table.entityId, entityId)));
  refresh();
}
