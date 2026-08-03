// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/db/test-helpers";
import {
  client,
  entity,
  expense,
  organization,
  project,
  resource,
} from "@/db/schema";
import {
  listInvoiceableExpenses,
  listResources,
  summarizePhases,
} from "@/lib/queries";

let pg: TestDb["pg"];
let db: TestDb["db"];

beforeEach(async () => {
  ({ pg, db } = await createTestDb());
});
afterEach(async () => {
  await pg.close();
});

async function makeEntity(name: string) {
  const [org] = await db
    .insert(organization)
    .values({ name, slug: name.toLowerCase() })
    .returning();
  const [ent] = await db
    .insert(entity)
    .values({ organizationId: org.id, name, type: "services" })
    .returning();
  return { orgId: org.id, entityId: ent.id };
}

describe("summarizePhases", () => {
  it("totals budget hours and amounts across phases", () => {
    const result = summarizePhases([
      { budgetHours: "120.00", budgetAmount: 2500000 },
      { budgetHours: "240.50", budgetAmount: 5000000 },
      { budgetHours: null, budgetAmount: null },
    ]);
    expect(result.totalHours).toBe(360.5);
    expect(result.totalAmount).toBe(7500000);
  });

  it("is zero for no phases", () => {
    expect(summarizePhases([])).toEqual({ totalHours: 0, totalAmount: 0 });
  });
});

describe("listResources", () => {
  it("hides deactivated resources from the active list but keeps them in history", async () => {
    const { orgId, entityId } = await makeEntity("Acme");
    await db.insert(resource).values([
      { organizationId: orgId, entityId, name: "Active Ann", status: "active" },
      { organizationId: orgId, entityId, name: "Retired Ray", status: "inactive" },
    ]);

    const activeOnly = await listResources(db, entityId, { activeOnly: true });
    expect(activeOnly.map((r) => r.name)).toEqual(["Active Ann"]);

    // History is preserved: the deactivated resource still exists.
    const all = await listResources(db, entityId);
    expect(all.map((r) => r.name).sort()).toEqual(["Active Ann", "Retired Ray"]);
  });

  it("scopes to the given entity", async () => {
    const a = await makeEntity("Alpha");
    const b = await makeEntity("Beta");
    await db
      .insert(resource)
      .values({ organizationId: a.orgId, entityId: a.entityId, name: "A" });
    await db
      .insert(resource)
      .values({ organizationId: b.orgId, entityId: b.entityId, name: "B" });

    const aRes = await listResources(db, a.entityId);
    expect(aRes.map((r) => r.name)).toEqual(["A"]);
  });
});

describe("listInvoiceableExpenses", () => {
  it("returns billable expenses and excludes non-billable ones", async () => {
    const { orgId, entityId } = await makeEntity("Exp");
    const [res] = await db
      .insert(resource)
      .values({ organizationId: orgId, entityId, name: "R" })
      .returning();
    const [cli] = await db
      .insert(client)
      .values({ organizationId: orgId, entityId, name: "C" })
      .returning();
    const [proj] = await db
      .insert(project)
      .values({
        organizationId: orgId,
        entityId,
        clientId: cli.id,
        code: "P1",
        name: "P",
        type: "time_materials",
      })
      .returning();
    await db.insert(expense).values([
      {
        organizationId: orgId,
        entityId,
        resourceId: res.id,
        projectId: proj.id,
        expenseDate: "2026-08-01",
        category: "travel",
        amount: 10000,
        billable: true,
        status: "submitted",
      },
      {
        organizationId: orgId,
        entityId,
        resourceId: res.id,
        projectId: proj.id,
        expenseDate: "2026-08-01",
        category: "meals",
        amount: 5000,
        billable: false,
        status: "submitted",
      },
      {
        organizationId: orgId,
        entityId,
        resourceId: res.id,
        projectId: proj.id,
        expenseDate: "2026-08-01",
        category: "lodging",
        amount: 20000,
        billable: true,
        status: "invoiced", // already billed -> excluded
      },
    ]);

    const rows = await listInvoiceableExpenses(db, entityId);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(10000);
    expect(rows[0].billable).toBe(true);
  });
});
