// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "./schema";
import { createTestDb, type TestDb } from "./test-helpers";
import { seed } from "./seed";

// Spin up a fresh in-process Postgres and apply all migrations. This proves the
// migrations apply cleanly against a real Postgres engine without needing a
// Supabase connection.
let pg: TestDb["pg"];
let db: TestDb["db"];

beforeEach(async () => {
  ({ pg, db } = await createTestDb());
});

afterEach(async () => {
  await pg.close();
});

async function count(table: string): Promise<number> {
  const { rows } = await pg.query<{ n: number }>(
    `select count(*)::int as n from "${table}"`,
  );
  return rows[0].n;
}

describe("migration", () => {
  it("creates every table in the schema", async () => {
    const { rows } = await pg.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    const names = rows.map((r) => r.table_name);

    // 5 core + 12 Phase 1 + 20 later-phase scaffolding = 37.
    expect(names).toHaveLength(37);
    for (const t of [
      "organization",
      "entity",
      "user",
      "membership",
      "audit_log",
      "client",
      "project",
      "phase",
      "resource",
      "indirect_code",
      "time_entry",
      "invoice",
      "invoice_line",
      "payment",
      "qbo_connection",
      "vehicle",
      "qsbs_lot",
    ]) {
      expect(names).toContain(t);
    }
  });

  it("enables row-level security (default-deny) on every table", async () => {
    const { rows } = await pg.query<{
      relname: string;
      relrowsecurity: boolean;
    }>(
      `select c.relname, c.relrowsecurity
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    );
    expect(rows.length).toBe(37);
    const withoutRls = rows.filter((r) => !r.relrowsecurity).map((r) => r.relname);
    expect(withoutRls).toEqual([]);
  });

  it("rejects a time entry with neither a project nor an indirect code", async () => {
    // Minimal valid parents so only the exactly-one check can fail.
    const [org] = await db
      .insert(schema.organization)
      .values({ name: "T", slug: "t" })
      .returning({ id: schema.organization.id });
    const [ent] = await db
      .insert(schema.entity)
      .values({ organizationId: org.id, name: "E", type: "services" })
      .returning({ id: schema.entity.id });
    const [res] = await db
      .insert(schema.resource)
      .values({ organizationId: org.id, entityId: ent.id, name: "R" })
      .returning({ id: schema.resource.id });

    await expect(
      db.insert(schema.timeEntry).values({
        organizationId: org.id,
        entityId: ent.id,
        resourceId: res.id,
        workDate: "2026-07-27",
        chargeType: "project",
        hours: "8.00",
        // no projectId, no indirectCodeId -> violates exactly-one check
      }),
    ).rejects.toThrow();
  });
});

describe("seed", () => {
  it("loads the sample design firm with the expected records", async () => {
    const summary = await seed(db);

    expect(summary).toMatchObject({
      organizations: 1,
      entities: 1,
      users: 3,
      resources: 4,
      clients: 3,
      projects: 3,
      phases: 7,
      indirectCodes: 8,
      timeEntries: 20,
    });

    // The counts in the summary match what actually landed in the database.
    expect(await count("organization")).toBe(1);
    expect(await count("entity")).toBe(1);
    expect(await count("resource")).toBe(4);
    expect(await count("project")).toBe(3);
    expect(await count("phase")).toBe(7);
    expect(await count("indirect_code")).toBe(8);
    expect(await count("time_entry")).toBe(20);
    expect(await count("membership")).toBe(3);
  });

  it("never bills indirect time and always sets exactly one charge target", async () => {
    await seed(db);

    const { rows: bad } = await pg.query<{ n: number }>(
      `select count(*)::int as n from time_entry
       where charge_type = 'indirect' and (billable = true or billable_amount <> 0)`,
    );
    expect(bad[0].n).toBe(0);

    const { rows: ambiguous } = await pg.query<{ n: number }>(
      `select count(*)::int as n from time_entry
       where (project_id is null) = (indirect_code_id is null)`,
    );
    expect(ambiguous[0].n).toBe(0);
  });

  it("computes billable amounts that tie out to hours x bill rate", async () => {
    await seed(db);

    // Ryan Hahn: 5 days x 8h x $225.00/h = $9,000.00 = 900000 cents.
    const { rows } = await pg.query<{ s: number }>(
      `select coalesce(sum(te.billable_amount), 0)::int as s
       from time_entry te
       join resource r on r.id = te.resource_id
       where r.name = 'Ryan Hahn'`,
    );
    expect(rows[0].s).toBe(900000);
  });
});
