import { and, asc, eq, isNull, type ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  client,
  contact,
  indirectCode,
  membership,
  phase,
  project,
  resource,
  user,
} from "@/db/schema";

type FullSchema = typeof import("@/db/schema");

// A drizzle db or transaction that can run reads against our schema. Reads are
// meant to run inside runWithUser() so RLS scopes them by membership; the
// explicit entityId filters then narrow to the active entity.
export type QueryDb = PgDatabase<
  PgQueryResultHKT,
  FullSchema,
  ExtractTablesWithRelations<FullSchema>
>;

export function listClients(db: QueryDb, entityId: string) {
  return db
    .select()
    .from(client)
    .where(and(eq(client.entityId, entityId), isNull(client.deletedAt)))
    .orderBy(asc(client.name));
}

export function getClient(db: QueryDb, entityId: string, clientId: string) {
  return db
    .select()
    .from(client)
    .where(
      and(
        eq(client.id, clientId),
        eq(client.entityId, entityId),
        isNull(client.deletedAt),
      ),
    )
    .limit(1);
}

export function listContacts(db: QueryDb, entityId: string, clientId: string) {
  return db
    .select()
    .from(contact)
    .where(
      and(
        eq(contact.entityId, entityId),
        eq(contact.clientId, clientId),
        isNull(contact.deletedAt),
      ),
    )
    .orderBy(asc(contact.name));
}

export function listProjects(db: QueryDb, entityId: string) {
  return db
    .select({
      id: project.id,
      code: project.code,
      name: project.name,
      type: project.type,
      status: project.status,
      contractValue: project.contractValue,
      clientName: client.name,
    })
    .from(project)
    .innerJoin(client, eq(client.id, project.clientId))
    .where(and(eq(project.entityId, entityId), isNull(project.deletedAt)))
    .orderBy(asc(project.code));
}

export function getProject(db: QueryDb, entityId: string, projectId: string) {
  return db
    .select()
    .from(project)
    .where(
      and(
        eq(project.id, projectId),
        eq(project.entityId, entityId),
        isNull(project.deletedAt),
      ),
    )
    .limit(1);
}

export function listPhases(db: QueryDb, entityId: string, projectId: string) {
  return db
    .select()
    .from(phase)
    .where(
      and(
        eq(phase.entityId, entityId),
        eq(phase.projectId, projectId),
        isNull(phase.deletedAt),
      ),
    )
    .orderBy(asc(phase.sortOrder));
}

export function listResources(
  db: QueryDb,
  entityId: string,
  opts?: { activeOnly?: boolean },
) {
  return db
    .select()
    .from(resource)
    .where(
      and(
        eq(resource.entityId, entityId),
        isNull(resource.deletedAt),
        opts?.activeOnly ? eq(resource.status, "active") : undefined,
      ),
    )
    .orderBy(asc(resource.name));
}

export function getResource(db: QueryDb, entityId: string, resourceId: string) {
  return db
    .select()
    .from(resource)
    .where(
      and(
        eq(resource.id, resourceId),
        eq(resource.entityId, entityId),
        isNull(resource.deletedAt),
      ),
    )
    .limit(1);
}

export function listIndirectCodes(
  db: QueryDb,
  entityId: string,
  opts?: { activeOnly?: boolean },
) {
  return db
    .select()
    .from(indirectCode)
    .where(
      and(
        eq(indirectCode.entityId, entityId),
        isNull(indirectCode.deletedAt),
        opts?.activeOnly ? eq(indirectCode.active, true) : undefined,
      ),
    )
    .orderBy(asc(indirectCode.code));
}

export function listEntityMembers(db: QueryDb, entityId: string) {
  return db
    .select({ userId: user.id, name: user.name })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(and(eq(membership.entityId, entityId), isNull(membership.deletedAt)))
    .orderBy(asc(user.name));
}

export function getIndirectCode(db: QueryDb, entityId: string, codeId: string) {
  return db
    .select()
    .from(indirectCode)
    .where(
      and(
        eq(indirectCode.id, codeId),
        eq(indirectCode.entityId, entityId),
        isNull(indirectCode.deletedAt),
      ),
    )
    .limit(1);
}

// --- Pure budget math (spec §7.2: project page shows a budget summary) -------

export type PhaseBudget = {
  budgetHours: string | null;
  budgetAmount: number | null;
};

export function summarizePhases(phases: PhaseBudget[]): {
  totalHours: number;
  totalAmount: number;
} {
  let totalHours = 0;
  let totalAmount = 0;
  for (const p of phases) {
    if (p.budgetHours) totalHours += Number(p.budgetHours);
    if (p.budgetAmount) totalAmount += p.budgetAmount;
  }
  return { totalHours, totalAmount };
}
