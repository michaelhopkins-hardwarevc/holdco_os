import { and, eq, isNull, sql } from "drizzle-orm";
import {
  client,
  indirectCode,
  phase,
  project,
  resource,
  timeEntry,
} from "@/db/schema";
import {
  cell,
  emptySummary,
  type FieldMap,
  type ImportSummary,
  isBlankRow,
  locateHeader,
  mapActiveStatus,
  mapChargeType,
  mapIndirectCategory,
  mapProjectStatus,
  mapProjectType,
  moneyToCents,
  parseCsv,
  parseDate,
  parseHours,
  parseTargetUtil,
  parseYesNo,
} from "@/lib/import";
import type { QueryDb } from "@/lib/queries";
import type { Actor } from "@/lib/timesheet-db";

// Historical time is imported as already-approved (it is finalized work, not a
// draft). It shows in reports immediately; managers can adjust status later.
const IMPORTED_TIME_STATUS = "approved" as const;

// --- Field maps (normalized header variants) --------------------------------

const EMPLOYEE_FIELDS: FieldMap = {
  name: ["employee name", "name", "employee"],
  title: ["role title", "title", "role"],
  status: ["status"],
  billRate: ["bill rate usd hr", "bill rate", "bill rate usd"],
  costRate: ["cost rate usd hr", "cost rate", "cost rate usd"],
  target: ["target util pct", "target util", "target utilization", "target"],
};

const PROJECT_FIELDS: FieldMap = {
  code: ["project num", "project number", "project code", "project", "job num", "job number"],
  client: ["client", "client name", "customer"],
  name: ["project name", "name"],
  type: ["type", "project type"],
  status: ["status"],
  phase: ["phase", "phase name"],
  fee: ["contract fee usd", "contract fee", "fee usd", "fee", "contract value usd", "contract value"],
};

const INDIRECT_FIELDS: FieldMap = {
  code: ["code", "indirect code"],
  category: ["category"],
  description: ["description", "desc"],
};

const TIME_FIELDS: FieldMap = {
  date: ["date", "work date"],
  employee: ["employee", "employee name", "name", "resource"],
  chargeType: ["charge type", "type"],
  charge: ["project code", "project", "project num", "code", "charge"],
  phase: ["phase", "phase name"],
  hours: ["hours", "hrs"],
  billable: ["billable"],
  billRate: ["bill rate", "bill rate usd hr", "bill rate usd"],
  notes: ["notes", "note"],
};

// --- Lookups ----------------------------------------------------------------

async function findResourceByName(db: QueryDb, entityId: string, name: string) {
  const [row] = await db
    .select({ id: resource.id, billRate: resource.billRate, costRate: resource.costRate })
    .from(resource)
    .where(
      and(
        eq(resource.entityId, entityId),
        sql`lower(${resource.name}) = lower(${name})`,
        isNull(resource.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function findProjectByCodeOrName(db: QueryDb, entityId: string, s: string) {
  const [row] = await db
    .select({ id: project.id })
    .from(project)
    .where(
      and(
        eq(project.entityId, entityId),
        sql`(lower(${project.code}) = lower(${s}) or lower(${project.name}) = lower(${s}))`,
        isNull(project.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function findPhase(db: QueryDb, projectId: string, name: string) {
  const [row] = await db
    .select({ id: phase.id })
    .from(phase)
    .where(
      and(
        eq(phase.projectId, projectId),
        sql`lower(${phase.name}) = lower(${name})`,
        isNull(phase.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function findOrCreateClient(
  db: QueryDb,
  actor: Actor,
  entityId: string,
  name: string,
): Promise<string> {
  const [existing] = await db
    .select({ id: client.id })
    .from(client)
    .where(
      and(
        eq(client.entityId, entityId),
        sql`lower(${client.name}) = lower(${name})`,
        isNull(client.deletedAt),
      ),
    )
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(client)
    .values({
      organizationId: actor.orgId,
      entityId,
      name,
      status: "active",
      createdBy: actor.actorId,
      updatedBy: actor.actorId,
    })
    .returning({ id: client.id });
  return created.id;
}

// --- Importers --------------------------------------------------------------

export async function importEmployees(
  db: QueryDb,
  actor: Actor,
  entityId: string,
  csvText: string,
): Promise<ImportSummary> {
  const summary = emptySummary("employees");
  const rows = parseCsv(csvText);
  const loc = locateHeader(rows, EMPLOYEE_FIELDS, ["name", "billRate", "costRate"]);
  if (!loc) {
    summary.errors.push({
      row: 0,
      message: "Could not find an Employees header row (need Employee Name, Bill Rate, Cost Rate).",
    });
    return summary;
  }

  for (let r = loc.headerRow + 1; r < rows.length; r++) {
    const cells = rows[r];
    if (isBlankRow(cells)) continue;
    const rowNum = r + 1;
    const name = cell(cells, loc.index, "name");
    if (!name) {
      summary.errors.push({ row: rowNum, message: "Missing employee name." });
      summary.skipped++;
      continue;
    }
    const billRate = moneyToCents(cell(cells, loc.index, "billRate"));
    const costRate = moneyToCents(cell(cells, loc.index, "costRate"));
    if (billRate === null || costRate === null) {
      summary.errors.push({ row: rowNum, message: `Invalid bill/cost rate for "${name}".` });
      summary.skipped++;
      continue;
    }
    const title = cell(cells, loc.index, "title") || null;
    const status = mapActiveStatus(cell(cells, loc.index, "status"));
    const target = parseTargetUtil(cell(cells, loc.index, "target"));

    const existing = await findResourceByName(db, entityId, name);
    if (existing) {
      await db
        .update(resource)
        .set({ title, billRate, costRate, targetUtilization: target, status, updatedBy: actor.actorId })
        .where(eq(resource.id, existing.id));
      summary.updated++;
    } else {
      await db.insert(resource).values({
        organizationId: actor.orgId,
        entityId,
        name,
        title,
        billRate,
        costRate,
        targetUtilization: target,
        status,
        createdBy: actor.actorId,
        updatedBy: actor.actorId,
      });
      summary.imported++;
    }
  }
  return summary;
}

export async function importProjects(
  db: QueryDb,
  actor: Actor,
  entityId: string,
  csvText: string,
): Promise<ImportSummary> {
  const summary = emptySummary("projects");
  const rows = parseCsv(csvText);
  const loc = locateHeader(rows, PROJECT_FIELDS, ["code", "client", "name", "type"]);
  if (!loc) {
    summary.errors.push({
      row: 0,
      message: "Could not find a Projects header row (need Project #, Client, Project Name, Type).",
    });
    return summary;
  }

  for (let r = loc.headerRow + 1; r < rows.length; r++) {
    const cells = rows[r];
    if (isBlankRow(cells)) continue;
    const rowNum = r + 1;
    const code = cell(cells, loc.index, "code");
    const clientName = cell(cells, loc.index, "client");
    const name = cell(cells, loc.index, "name");
    const typeStr = cell(cells, loc.index, "type");
    if (!code || !clientName || !name) {
      summary.errors.push({ row: rowNum, message: "Missing project number, client, or name." });
      summary.skipped++;
      continue;
    }
    const type = mapProjectType(typeStr);
    if (!type) {
      summary.errors.push({ row: rowNum, message: `Unknown project type "${typeStr}" for ${code}.` });
      summary.skipped++;
      continue;
    }
    const status = mapProjectStatus(cell(cells, loc.index, "status"));
    const fee = moneyToCents(cell(cells, loc.index, "fee"));
    const phaseName = cell(cells, loc.index, "phase");

    const clientId = await findOrCreateClient(db, actor, entityId, clientName);

    const [existing] = await db
      .select({ id: project.id })
      .from(project)
      .where(
        and(
          eq(project.entityId, entityId),
          sql`lower(${project.code}) = lower(${code})`,
          isNull(project.deletedAt),
        ),
      )
      .limit(1);

    let projectId: string;
    if (existing) {
      projectId = existing.id;
      await db
        .update(project)
        .set({ name, type: type as never, status: status as never, clientId, contractValue: fee, updatedBy: actor.actorId })
        .where(eq(project.id, existing.id));
      summary.updated++;
    } else {
      const [created] = await db
        .insert(project)
        .values({
          organizationId: actor.orgId,
          entityId,
          clientId,
          code,
          name,
          type: type as never,
          status: status as never,
          contractValue: fee,
          createdBy: actor.actorId,
          updatedBy: actor.actorId,
        })
        .returning({ id: project.id });
      projectId = created.id;
      summary.imported++;
    }

    if (phaseName) {
      const existingPhase = await findPhase(db, projectId, phaseName);
      if (!existingPhase) {
        await db.insert(phase).values({
          organizationId: actor.orgId,
          entityId,
          projectId,
          name: phaseName,
          createdBy: actor.actorId,
          updatedBy: actor.actorId,
        });
      }
    }
  }
  return summary;
}

export async function importIndirectCodes(
  db: QueryDb,
  actor: Actor,
  entityId: string,
  csvText: string,
): Promise<ImportSummary> {
  const summary = emptySummary("indirect codes");
  const rows = parseCsv(csvText);
  const loc = locateHeader(rows, INDIRECT_FIELDS, ["code", "category"]);
  if (!loc) {
    summary.errors.push({
      row: 0,
      message: "Could not find an Indirect Codes header row (need Code, Category).",
    });
    return summary;
  }

  for (let r = loc.headerRow + 1; r < rows.length; r++) {
    const cells = rows[r];
    if (isBlankRow(cells)) continue;
    const rowNum = r + 1;
    const code = cell(cells, loc.index, "code");
    const categoryStr = cell(cells, loc.index, "category");
    if (!code) {
      summary.errors.push({ row: rowNum, message: "Missing indirect code." });
      summary.skipped++;
      continue;
    }
    const category = mapIndirectCategory(categoryStr);
    if (!category) {
      summary.errors.push({ row: rowNum, message: `Unknown category "${categoryStr}" for ${code}.` });
      summary.skipped++;
      continue;
    }
    const description = cell(cells, loc.index, "description") || null;

    const [existing] = await db
      .select({ id: indirectCode.id })
      .from(indirectCode)
      .where(
        and(
          eq(indirectCode.entityId, entityId),
          sql`lower(${indirectCode.code}) = lower(${code})`,
          isNull(indirectCode.deletedAt),
        ),
      )
      .limit(1);
    if (existing) {
      await db
        .update(indirectCode)
        .set({ category: category as never, description, updatedBy: actor.actorId })
        .where(eq(indirectCode.id, existing.id));
      summary.updated++;
    } else {
      await db.insert(indirectCode).values({
        organizationId: actor.orgId,
        entityId,
        code,
        category: category as never,
        description,
        createdBy: actor.actorId,
        updatedBy: actor.actorId,
      });
      summary.imported++;
    }
  }
  return summary;
}

export async function importTimeEntries(
  db: QueryDb,
  actor: Actor,
  entityId: string,
  csvText: string,
): Promise<ImportSummary> {
  const summary = emptySummary("time");
  const rows = parseCsv(csvText);
  const loc = locateHeader(rows, TIME_FIELDS, ["date", "employee", "chargeType", "hours"]);
  if (!loc) {
    summary.errors.push({
      row: 0,
      message: "Could not find a Time header row (need Date, Employee, Charge Type, Hours).",
    });
    return summary;
  }

  for (let r = loc.headerRow + 1; r < rows.length; r++) {
    const cells = rows[r];
    if (isBlankRow(cells)) continue;
    const rowNum = r + 1;

    const workDate = parseDate(cell(cells, loc.index, "date"));
    if (!workDate) {
      summary.errors.push({ row: rowNum, message: "Missing or invalid date." });
      summary.skipped++;
      continue;
    }
    const empName = cell(cells, loc.index, "employee");
    const res = empName ? await findResourceByName(db, entityId, empName) : null;
    if (!res) {
      summary.errors.push({ row: rowNum, message: `Employee "${empName}" not found. Import Employees first.` });
      summary.skipped++;
      continue;
    }
    const chargeType = mapChargeType(cell(cells, loc.index, "chargeType"));
    if (!chargeType) {
      summary.errors.push({ row: rowNum, message: "Charge type must be Project or Indirect." });
      summary.skipped++;
      continue;
    }
    const hours = parseHours(cell(cells, loc.index, "hours"));
    if (hours === null) {
      summary.errors.push({ row: rowNum, message: "Missing or invalid hours." });
      summary.skipped++;
      continue;
    }
    const chargeRef = cell(cells, loc.index, "charge");

    let projectId: string | null = null;
    let phaseId: string | null = null;
    let indirectCodeId: string | null = null;
    let billable = false;

    if (chargeType === "project") {
      const proj = chargeRef ? await findProjectByCodeOrName(db, entityId, chargeRef) : null;
      if (!proj) {
        summary.errors.push({ row: rowNum, message: `Project "${chargeRef}" not found. Import Projects first.` });
        summary.skipped++;
        continue;
      }
      projectId = proj.id;
      const phaseName = cell(cells, loc.index, "phase");
      if (phaseName) {
        const ph = await findPhase(db, proj.id, phaseName);
        phaseId = ph?.id ?? null;
      }
      billable = parseYesNo(cell(cells, loc.index, "billable"));
    } else {
      const code = chargeRef
        ? (
            await db
              .select({ id: indirectCode.id })
              .from(indirectCode)
              .where(
                and(
                  eq(indirectCode.entityId, entityId),
                  sql`lower(${indirectCode.code}) = lower(${chargeRef})`,
                  isNull(indirectCode.deletedAt),
                ),
              )
              .limit(1)
          )[0]
        : null;
      if (!code) {
        summary.errors.push({ row: rowNum, message: `Indirect code "${chargeRef}" not found. Import Indirect Codes first.` });
        summary.skipped++;
        continue;
      }
      indirectCodeId = code.id;
      billable = false; // indirect time is never billable (DB enforces this)
    }

    const rowBillRate = moneyToCents(cell(cells, loc.index, "billRate"));
    const billRate = rowBillRate ?? res.billRate;
    const costRate = res.costRate;
    const billableAmount = billable ? Math.round(hours * billRate) : 0;
    const costAmount = Math.round(hours * costRate);

    await db.insert(timeEntry).values({
      organizationId: actor.orgId,
      entityId,
      resourceId: res.id,
      workDate,
      chargeType,
      projectId,
      phaseId,
      indirectCodeId,
      hours: hours.toFixed(2),
      billable,
      billRate: billable ? billRate : 0,
      costRate,
      billableAmount,
      costAmount,
      notes: cell(cells, loc.index, "notes") || null,
      status: IMPORTED_TIME_STATUS,
      createdBy: actor.actorId,
      updatedBy: actor.actorId,
    });
    summary.imported++;
  }
  return summary;
}
