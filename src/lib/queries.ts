import {
  and,
  asc,
  eq,
  gte,
  isNull,
  lte,
  type ExtractTablesWithRelations,
} from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  client,
  contact,
  indirectCode,
  membership,
  phase,
  project,
  resource,
  signal,
  timeEntry,
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

export function listEntityPhases(db: QueryDb, entityId: string) {
  return db
    .select({ id: phase.id, projectId: phase.projectId, name: phase.name })
    .from(phase)
    .where(and(eq(phase.entityId, entityId), isNull(phase.deletedAt)))
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

// --- Timesheet (spec §7.3) --------------------------------------------------

/** The billable resource linked to a user in an entity (for their timesheet). */
export function getResourceForUser(
  db: QueryDb,
  entityId: string,
  userId: string,
) {
  return db
    .select()
    .from(resource)
    .where(
      and(
        eq(resource.entityId, entityId),
        eq(resource.userId, userId),
        isNull(resource.deletedAt),
      ),
    )
    .limit(1);
}

/** All non-deleted time entries for a resource within a date range, with the
 *  labels needed to render grid rows. */
export function getWeekEntries(
  db: QueryDb,
  entityId: string,
  resourceId: string,
  start: string,
  end: string,
) {
  return db
    .select({
      id: timeEntry.id,
      workDate: timeEntry.workDate,
      hours: timeEntry.hours,
      chargeType: timeEntry.chargeType,
      projectId: timeEntry.projectId,
      phaseId: timeEntry.phaseId,
      indirectCodeId: timeEntry.indirectCodeId,
      billable: timeEntry.billable,
      billableAmount: timeEntry.billableAmount,
      costAmount: timeEntry.costAmount,
      status: timeEntry.status,
      projectCode: project.code,
      phaseName: phase.name,
      indirectCodeLabel: indirectCode.code,
    })
    .from(timeEntry)
    .leftJoin(project, eq(project.id, timeEntry.projectId))
    .leftJoin(phase, eq(phase.id, timeEntry.phaseId))
    .leftJoin(indirectCode, eq(indirectCode.id, timeEntry.indirectCodeId))
    .where(
      and(
        eq(timeEntry.entityId, entityId),
        eq(timeEntry.resourceId, resourceId),
        gte(timeEntry.workDate, start),
        lte(timeEntry.workDate, end),
        isNull(timeEntry.deletedAt),
      ),
    );
}

/** Open signals for a resource within a date range, with charge labels. */
export function listOpenSignals(
  db: QueryDb,
  entityId: string,
  resourceId: string,
  start: string,
  end: string,
) {
  return db
    .select({
      id: signal.id,
      workDate: signal.workDate,
      provider: signal.provider,
      evidence: signal.evidence,
      provenance: signal.provenance,
      chargeType: signal.chargeType,
      proposedHours: signal.proposedHours,
      confidence: signal.confidence,
      projectCode: project.code,
      phaseName: phase.name,
      indirectCodeLabel: indirectCode.code,
    })
    .from(signal)
    .leftJoin(project, eq(project.id, signal.projectId))
    .leftJoin(phase, eq(phase.id, signal.phaseId))
    .leftJoin(indirectCode, eq(indirectCode.id, signal.indirectCodeId))
    .where(
      and(
        eq(signal.entityId, entityId),
        eq(signal.resourceId, resourceId),
        eq(signal.state, "open"),
        gte(signal.workDate, start),
        lte(signal.workDate, end),
        isNull(signal.deletedAt),
      ),
    )
    .orderBy(asc(signal.workDate));
}

/** Submitted time entries across the entity (for the approvals queue). */
export function listSubmittedEntries(db: QueryDb, entityId: string) {
  return db
    .select({
      resourceId: timeEntry.resourceId,
      resourceName: resource.name,
      workDate: timeEntry.workDate,
      hours: timeEntry.hours,
    })
    .from(timeEntry)
    .innerJoin(resource, eq(resource.id, timeEntry.resourceId))
    .where(
      and(
        eq(timeEntry.entityId, entityId),
        eq(timeEntry.status, "submitted"),
        isNull(timeEntry.deletedAt),
      ),
    );
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
