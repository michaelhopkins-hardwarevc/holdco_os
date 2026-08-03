// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  client,
  entity,
  indirectCode,
  organization,
  phase,
  project,
  resource,
  timeEntry,
} from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-helpers";
import {
  importEmployees,
  importIndirectCodes,
  importProjects,
  importTimeEntries,
} from "@/lib/import-db";

let pg: TestDb["pg"];
let db: TestDb["db"];
let entityId: string;
let actor: { orgId: string; actorId: string };

beforeEach(async () => {
  ({ pg, db } = await createTestDb());
  const [org] = await db.insert(organization).values({ name: "O", slug: "o" }).returning();
  const [ent] = await db
    .insert(entity)
    .values({ organizationId: org.id, name: "E", type: "services" })
    .returning();
  entityId = ent.id;
  actor = { orgId: org.id, actorId: "00000000-0000-0000-0000-000000000001" };
});
afterEach(async () => {
  await pg.close();
});

// CSVs mirror the interim workbook tabs: two title rows, then the header row,
// then data (with a couple of intentionally bad rows).
const EMPLOYEES_CSV = `Employees,,,,,,
Fill the yellow cells. Bill Rate = default charge-out rate.,,,,,,
Emp ID,Employee Name,Role / Title,Status,Bill Rate ($/hr),Cost Rate ($/hr),Target Util %
E001,Jane Designer,Senior Industrial Designer,Active,145,68,0.75
E002,Bob Engineer,Mechanical Engineer,Active,160,80,0.80
,,,,,,
E003,,Missing Name,Active,100,50,0.6
`;

const INDIRECT_CSV = `Indirect Codes,,
Non-billable time buckets.,,
Code,Category,Description
OH-ADMIN,Overhead,General administration
OH-BD,Business Dev,Proposals and marketing
OH-BAD,Nonsense Category,should fail
`;

const PROJECTS_CSV = `Projects,,,,,,,,
One row per active project/phase.,,,,,,,,
Project #,Client,Project Name,Type,Status,Phase,Contract Fee ($),Start Date,Project Manager
25-014,Acme Powersports,Handlebar Control Module Redesign,Time & Materials,Active,Concept,85000,,M. Hopkins
25-014,Acme Powersports,Handlebar Control Module Redesign,Time & Materials,Active,Detailed Design,85000,,M. Hopkins
25-020,Globex,Widget Program,Bad Type,Active,Concept,50000,,M. Hopkins
`;

const TIME_CSV = `Time Entry,,,,,,,,,,,
One row per person per charge per day.,,,,,,,,,,,
Date,Week Ending,Employee,Charge Type,Project / Code,Phase,Hours,Billable?,Bill Rate,Billable $,Cost $,Notes
2026-08-04,2026-08-09,Jane Designer,Project,Handlebar Control Module Redesign,Concept,6.5,Yes,145,942.5,442,Concept sketches
2026-08-05,2026-08-09,Bob Engineer,Indirect,OH-ADMIN,,8,No,,,,Admin work
2026-08-06,2026-08-09,Ghost Person,Project,Handlebar Control Module Redesign,Concept,4,Yes,145,,,
2026-08-07,2026-08-09,Jane Designer,Project,Nonexistent Project,Concept,4,Yes,145,,,
`;

describe("workbook CSV import", () => {
  it("imports Employees with a validation report for bad rows", async () => {
    const s = await importEmployees(db, actor, entityId, EMPLOYEES_CSV);
    expect(s.imported).toBe(2);
    expect(s.skipped).toBe(1);
    expect(s.errors).toHaveLength(1);
    expect(s.errors[0].message).toMatch(/name/i);

    const rows = await db.select().from(resource).where(eq(resource.entityId, entityId));
    expect(rows).toHaveLength(2);
    const jane = rows.find((r) => r.name === "Jane Designer")!;
    expect(jane.billRate).toBe(14500);
    expect(jane.costRate).toBe(6800);
    expect(jane.targetUtilization).toBe("75.00");
  });

  it("imports Indirect Codes and flags an unknown category", async () => {
    const s = await importIndirectCodes(db, actor, entityId, INDIRECT_CSV);
    expect(s.imported).toBe(2);
    expect(s.skipped).toBe(1);
    const codes = await db.select().from(indirectCode).where(eq(indirectCode.entityId, entityId));
    expect(codes.map((c) => c.code).sort()).toEqual(["OH-ADMIN", "OH-BD"]);
  });

  it("imports Projects (client find-or-create, phases, bad type flagged)", async () => {
    const s = await importProjects(db, actor, entityId, PROJECTS_CSV);
    // Row 1 creates project 25-014; row 2 updates it (adds a phase); row 3 fails.
    expect(s.imported).toBe(1);
    expect(s.updated).toBe(1);
    expect(s.skipped).toBe(1);

    const clients = await db.select().from(client).where(eq(client.entityId, entityId));
    expect(clients).toHaveLength(1); // Acme created once
    const projects = await db.select().from(project).where(eq(project.entityId, entityId));
    expect(projects).toHaveLength(1);
    expect(projects[0].code).toBe("25-014");
    expect(projects[0].type).toBe("time_materials");
    expect(projects[0].contractValue).toBe(8500000); // $85,000
    const phases = await db
      .select()
      .from(phase)
      .where(eq(phase.projectId, projects[0].id));
    expect(phases.map((p) => p.name).sort()).toEqual(["Concept", "Detailed Design"]);
  });

  it("imports Time mapped to employees/projects/codes with a validation report", async () => {
    await importEmployees(db, actor, entityId, EMPLOYEES_CSV);
    await importIndirectCodes(db, actor, entityId, INDIRECT_CSV);
    await importProjects(db, actor, entityId, PROJECTS_CSV);

    const s = await importTimeEntries(db, actor, entityId, TIME_CSV);
    // Jane/project + Bob/indirect import; Ghost (no employee) and Nonexistent
    // Project both fail with reasons.
    expect(s.imported).toBe(2);
    expect(s.skipped).toBe(2);
    expect(s.errors.map((e) => e.message).join(" ")).toMatch(/Ghost/);
    expect(s.errors.map((e) => e.message).join(" ")).toMatch(/Nonexistent Project/);

    const entries = await db.select().from(timeEntry).where(eq(timeEntry.entityId, entityId));
    expect(entries).toHaveLength(2);

    const [proj] = await db.select().from(project).where(eq(project.entityId, entityId));
    const janeEntry = entries.find((e) => e.projectId === proj.id)!;
    expect(janeEntry.billable).toBe(true);
    expect(Number(janeEntry.hours)).toBe(6.5);
    expect(janeEntry.billableAmount).toBe(94250); // 6.5 * $145
    expect(janeEntry.costAmount).toBe(44200); // 6.5 * $68
    expect(janeEntry.phaseId).not.toBeNull();
    expect(janeEntry.status).toBe("approved");

    const indirectEntry = entries.find((e) => e.chargeType === "indirect")!;
    expect(indirectEntry.billable).toBe(false);
    expect(indirectEntry.billableAmount).toBe(0);
    expect(indirectEntry.projectId).toBeNull();
    expect(indirectEntry.indirectCodeId).not.toBeNull();
  });

  it("re-importing Employees updates in place (idempotent by name)", async () => {
    await importEmployees(db, actor, entityId, EMPLOYEES_CSV);
    const s = await importEmployees(db, actor, entityId, EMPLOYEES_CSV);
    expect(s.imported).toBe(0);
    expect(s.updated).toBe(2);
    const rows = await db.select().from(resource).where(eq(resource.entityId, entityId));
    expect(rows).toHaveLength(2); // no duplicates
  });
});
