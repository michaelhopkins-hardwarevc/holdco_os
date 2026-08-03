// @vitest-environment node
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  client,
  entity,
  indirectCode,
  organization,
  phase,
  project,
  resource,
  timeEntry,
  user,
} from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-helpers";
import {
  addSingleEntry,
  applyTimesheet,
  submitTimesheetWeek,
  TimesheetLockedError,
  transitionTimesheetWeek,
} from "@/lib/timesheet-db";

let pg: TestDb["pg"];
let db: TestDb["db"];

beforeEach(async () => {
  ({ pg, db } = await createTestDb());
});
afterEach(async () => {
  await pg.close();
});

const WEEK_START = "2026-07-27"; // a Monday

async function setup() {
  const [org] = await db
    .insert(organization)
    .values({ name: "Org", slug: "org" })
    .returning();
  const [ent] = await db
    .insert(entity)
    .values({ organizationId: org.id, name: "E", type: "services" })
    .returning();
  const [actor] = await db
    .insert(user)
    .values({ organizationId: org.id, email: "a@example.com", name: "Actor" })
    .returning();
  const [res] = await db
    .insert(resource)
    .values({
      organizationId: org.id,
      entityId: ent.id,
      name: "Ann",
      billRate: 22500,
      costRate: 9000,
    })
    .returning();
  const [cli] = await db
    .insert(client)
    .values({ organizationId: org.id, entityId: ent.id, name: "Client" })
    .returning();
  const [proj] = await db
    .insert(project)
    .values({
      organizationId: org.id,
      entityId: ent.id,
      clientId: cli.id,
      code: "P1",
      name: "Proj",
      type: "time_materials",
    })
    .returning();
  const [ph] = await db
    .insert(phase)
    .values({ organizationId: org.id, entityId: ent.id, projectId: proj.id, name: "Design" })
    .returning();
  const [ind] = await db
    .insert(indirectCode)
    .values({
      organizationId: org.id,
      entityId: ent.id,
      code: "PTO",
      category: "pto",
    })
    .returning();

  return {
    actor: { orgId: org.id, actorId: actor.id },
    rates: { billRate: res.billRate, costRate: res.costRate },
    entityId: ent.id,
    resourceId: res.id,
    projectId: proj.id,
    phaseId: ph.id,
    indirectCodeId: ind.id,
  };
}

describe("applyTimesheet", () => {
  it("computes billable/cost amounts; indirect never bills", async () => {
    const s = await setup();
    await applyTimesheet(db, s.actor, s.rates, {
      entityId: s.entityId,
      resourceId: s.resourceId,
      weekStart: WEEK_START,
      cells: [
        {
          chargeType: "project",
          projectId: s.projectId,
          phaseId: s.phaseId,
          date: "2026-07-27",
          hours: 8,
        },
        {
          chargeType: "indirect",
          indirectCodeId: s.indirectCodeId,
          date: "2026-07-28",
          hours: 8,
        },
      ],
    });

    const rows = await db
      .select()
      .from(timeEntry)
      .where(eq(timeEntry.resourceId, s.resourceId));
    const proj = rows.find((r) => r.chargeType === "project")!;
    const ind = rows.find((r) => r.chargeType === "indirect")!;
    expect(proj.billableAmount).toBe(180000);
    expect(proj.costAmount).toBe(72000);
    expect(ind.billableAmount).toBe(0);
    expect(ind.billable).toBe(false);
    expect(ind.costAmount).toBe(72000);
  });

  it("removes a cell set back to zero", async () => {
    const s = await setup();
    const base = {
      entityId: s.entityId,
      resourceId: s.resourceId,
      weekStart: WEEK_START,
    };
    await applyTimesheet(db, s.actor, s.rates, {
      ...base,
      cells: [
        { chargeType: "project", projectId: s.projectId, phaseId: s.phaseId, date: "2026-07-27", hours: 8 },
      ],
    });
    await applyTimesheet(db, s.actor, s.rates, {
      ...base,
      cells: [
        { chargeType: "project", projectId: s.projectId, phaseId: s.phaseId, date: "2026-07-27", hours: 0 },
      ],
    });
    const live = await db
      .select()
      .from(timeEntry)
      .where(and(eq(timeEntry.resourceId, s.resourceId)));
    expect(live.filter((r) => r.deletedAt === null)).toHaveLength(0);
  });

  it("honors a manager's per-cell rate and billable override", async () => {
    const s = await setup();
    await applyTimesheet(db, s.actor, s.rates, {
      entityId: s.entityId,
      resourceId: s.resourceId,
      weekStart: WEEK_START,
      cells: [
        {
          chargeType: "project",
          projectId: s.projectId,
          phaseId: s.phaseId,
          date: "2026-07-27",
          hours: 8,
          billRate: 30000,
          billable: true,
        },
        {
          chargeType: "project",
          projectId: s.projectId,
          phaseId: s.phaseId,
          date: "2026-07-28",
          hours: 8,
          billable: false, // manager marks this day non-billable
        },
      ],
    });
    const rows = await db
      .select()
      .from(timeEntry)
      .where(eq(timeEntry.resourceId, s.resourceId));
    const billed = rows.find((r) => r.workDate === "2026-07-27")!;
    const notBilled = rows.find((r) => r.workDate === "2026-07-28")!;
    expect(billed.billRate).toBe(30000);
    expect(billed.billableAmount).toBe(240000); // 8 * 30000
    expect(notBilled.billable).toBe(false);
    expect(notBilled.billableAmount).toBe(0);
  });

  it("refuses to edit a locked (submitted) week", async () => {
    const s = await setup();
    const input = {
      entityId: s.entityId,
      resourceId: s.resourceId,
      weekStart: WEEK_START,
      cells: [
        { chargeType: "project" as const, projectId: s.projectId, phaseId: s.phaseId, date: "2026-07-27", hours: 8 },
      ],
    };
    await applyTimesheet(db, s.actor, s.rates, input);
    await submitTimesheetWeek(db, s.actor, s.entityId, s.resourceId, WEEK_START);
    await expect(applyTimesheet(db, s.actor, s.rates, input)).rejects.toBeInstanceOf(
      TimesheetLockedError,
    );
  });
});

describe("addSingleEntry", () => {
  const single = (over: {
    date: string;
    chargeType: "project" | "indirect";
    projectId: string | null;
    phaseId: string | null;
    indirectCodeId: string | null;
    hours: number;
    entityId: string;
    resourceId: string;
  }) => over;

  it("adds one entry and folds a duplicate charge/day", async () => {
    const s = await setup();
    const base = { entityId: s.entityId, resourceId: s.resourceId };
    await addSingleEntry(
      db,
      s.actor,
      s.rates,
      single({ ...base, date: "2026-07-27", chargeType: "project", projectId: s.projectId, phaseId: s.phaseId, indirectCodeId: null, hours: 2 }),
    );
    await addSingleEntry(
      db,
      s.actor,
      s.rates,
      single({ ...base, date: "2026-07-27", chargeType: "project", projectId: s.projectId, phaseId: s.phaseId, indirectCodeId: null, hours: 3 }),
    );
    const rows = await db
      .select()
      .from(timeEntry)
      .where(eq(timeEntry.resourceId, s.resourceId));
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].hours)).toBe(5);
  });

  it("refuses to add to a locked week", async () => {
    const s = await setup();
    await addSingleEntry(
      db,
      s.actor,
      s.rates,
      single({ entityId: s.entityId, resourceId: s.resourceId, date: "2026-07-27", chargeType: "project", projectId: s.projectId, phaseId: s.phaseId, indirectCodeId: null, hours: 2 }),
    );
    await submitTimesheetWeek(db, s.actor, s.entityId, s.resourceId, WEEK_START);
    await expect(
      addSingleEntry(
        db,
        s.actor,
        s.rates,
        single({ entityId: s.entityId, resourceId: s.resourceId, date: "2026-07-28", chargeType: "indirect", projectId: null, phaseId: null, indirectCodeId: s.indirectCodeId, hours: 1 }),
      ),
    ).rejects.toThrow();
  });
});

describe("submit / approve", () => {
  it("submits, then approve flips status and writes the audit log", async () => {
    const s = await setup();
    await applyTimesheet(db, s.actor, s.rates, {
      entityId: s.entityId,
      resourceId: s.resourceId,
      weekStart: WEEK_START,
      cells: [
        { chargeType: "project", projectId: s.projectId, phaseId: s.phaseId, date: "2026-07-27", hours: 8 },
      ],
    });

    const submitted = await submitTimesheetWeek(
      db,
      s.actor,
      s.entityId,
      s.resourceId,
      WEEK_START,
    );
    expect(submitted).toBe(1);

    const approved = await transitionTimesheetWeek(
      db,
      s.actor,
      s.entityId,
      s.resourceId,
      WEEK_START,
      "approved",
      "approve",
      null,
    );
    expect(approved).toBe(1);

    const [entry] = await db
      .select()
      .from(timeEntry)
      .where(eq(timeEntry.resourceId, s.resourceId));
    expect(entry.status).toBe("approved");

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "approve"));
    expect(audits).toHaveLength(1);
    expect(audits[0].tableName).toBe("time_entry");
  });
});
