// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyUserContext } from "./rls";
import { client, entity, membership, organization, user } from "./schema";
import { createTestDb, type TestDb } from "./test-helpers";

// Proves the §7.1 acceptance criterion: with RLS in force, a staff user of one
// entity cannot read another entity's rows through the (Drizzle) API. The test
// runs against a real Postgres engine (PGlite) with the same role +
// jwt-claim context the app sets in production.
let pg: TestDb["pg"];
let db: TestDb["db"];

beforeEach(async () => {
  ({ pg, db } = await createTestDb());
});

afterEach(async () => {
  await pg.close();
});

// Seed two entities with entity-scoped data, and a staff user in entity A only.
// Uses the service-role connection (bypasses RLS) to set up the fixture.
async function setup() {
  const [org] = await db
    .insert(organization)
    .values({ name: "Org", slug: "org" })
    .returning();
  const [entA] = await db
    .insert(entity)
    .values({ organizationId: org.id, name: "Entity A", type: "services" })
    .returning();
  const [entB] = await db
    .insert(entity)
    .values({ organizationId: org.id, name: "Entity B", type: "services" })
    .returning();

  const staffAuthId = randomUUID();
  const [staff] = await db
    .insert(user)
    .values({
      organizationId: org.id,
      email: "staff-a@example.com",
      name: "Staff A",
      authId: staffAuthId,
    })
    .returning();
  await db.insert(membership).values({
    organizationId: org.id,
    entityId: entA.id,
    userId: staff.id,
    role: "staff",
  });

  await db.insert(client).values([
    { organizationId: org.id, entityId: entA.id, name: "Client A" },
    { organizationId: org.id, entityId: entB.id, name: "Client B" },
  ]);

  return { org, entA, entB, staff, staffAuthId };
}

describe("row-level security", () => {
  it("a staff user of one entity cannot read another entity's rows", async () => {
    const s = await setup();

    const result = await db.transaction(async (tx) => {
      await applyUserContext(tx, s.staffAuthId);
      const clients = await tx.select().from(client);
      const entities = await tx.select().from(entity);
      return { clients, entities };
    });

    // Only entity A's data is visible; entity B is completely hidden.
    expect(result.clients.map((c) => c.name)).toEqual(["Client A"]);
    expect(result.entities.map((e) => e.name)).toEqual(["Entity A"]);
  });

  it("a member of both entities sees both", async () => {
    const s = await setup();
    const bothAuthId = randomUUID();
    const [both] = await db
      .insert(user)
      .values({
        organizationId: s.org.id,
        email: "both@example.com",
        name: "Both",
        authId: bothAuthId,
      })
      .returning();
    await db.insert(membership).values([
      {
        organizationId: s.org.id,
        entityId: s.entA.id,
        userId: both.id,
        role: "manager",
      },
      {
        organizationId: s.org.id,
        entityId: s.entB.id,
        userId: both.id,
        role: "staff",
      },
    ]);

    const clients = await db.transaction(async (tx) => {
      await applyUserContext(tx, bothAuthId);
      return tx.select().from(client);
    });

    expect(clients.map((c) => c.name).sort()).toEqual(["Client A", "Client B"]);
  });

  it("a user with no memberships sees no entity data", async () => {
    const s = await setup();
    const strangerAuthId = randomUUID();
    await db.insert(user).values({
      organizationId: s.org.id,
      email: "stranger@example.com",
      name: "Stranger",
      authId: strangerAuthId,
    });

    const clients = await db.transaction(async (tx) => {
      await applyUserContext(tx, strangerAuthId);
      return tx.select().from(client);
    });

    expect(clients).toEqual([]);
  });
});
