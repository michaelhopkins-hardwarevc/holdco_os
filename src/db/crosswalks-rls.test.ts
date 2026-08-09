// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyUserContext } from "./rls";
import {
  client,
  crosswalkParty,
  crosswalkPerson,
  crosswalkProject,
  entity,
  membership,
  organization,
  project,
  resource,
  user,
} from "./schema";
import { createTestDb, type TestDb } from "./test-helpers";

// Proves the crosswalk tables honor the same entity isolation as the rest of the
// schema: a staff user of entity A cannot read entity B's crosswalks through the
// Drizzle API with RLS in force.
let pg: TestDb["pg"];
let db: TestDb["db"];

beforeEach(async () => {
  ({ pg, db } = await createTestDb());
});

afterEach(async () => {
  await pg.close();
});

// Build one entity's worth of crosswalk fixture: a resource, a client, a
// project, and one crosswalk row of each kind pointing at them.
async function seedEntityCrosswalks(
  orgId: string,
  entityId: string,
  tag: string,
) {
  const scope = { organizationId: orgId, entityId };
  const [res] = await db
    .insert(resource)
    .values({ ...scope, name: `Res ${tag}` })
    .returning({ id: resource.id });
  const [cli] = await db
    .insert(client)
    .values({ ...scope, name: `Client ${tag}` })
    .returning({ id: client.id });
  const [proj] = await db
    .insert(project)
    .values({
      ...scope,
      clientId: cli.id,
      code: `P-${tag}`,
      name: `Project ${tag}`,
      type: "time_materials",
    })
    .returning({ id: project.id });

  await db.insert(crosswalkPerson).values({
    ...scope,
    sourceSystem: "microsoft",
    sourceUserId: `entra-${tag}`,
    resourceId: res.id,
  });
  await db.insert(crosswalkParty).values({
    ...scope,
    matchType: "email_domain",
    matchValue: `${tag}.com`,
    clientId: cli.id,
  });
  await db.insert(crosswalkProject).values({
    ...scope,
    projectId: proj.id,
    clientId: cli.id,
    mondayBoardId: `board-${tag}`,
  });
}

// Two entities each with a full crosswalk fixture, and a staff user in entity A.
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

  await seedEntityCrosswalks(org.id, entA.id, "aaa");
  await seedEntityCrosswalks(org.id, entB.id, "bbb");

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

  return { org, entA, entB, staffAuthId };
}

describe("crosswalk row-level security", () => {
  it("a staff user sees only their own entity's crosswalks", async () => {
    const s = await setup();

    const result = await db.transaction(async (tx) => {
      await applyUserContext(tx, s.staffAuthId);
      const persons = await tx.select().from(crosswalkPerson);
      const parties = await tx.select().from(crosswalkParty);
      const projects = await tx.select().from(crosswalkProject);
      return { persons, parties, projects };
    });

    expect(result.persons.map((r) => r.sourceUserId)).toEqual(["entra-aaa"]);
    expect(result.parties.map((r) => r.matchValue)).toEqual(["aaa.com"]);
    expect(result.projects.map((r) => r.mondayBoardId)).toEqual(["board-aaa"]);
  });

  it("a user with no membership sees no crosswalks", async () => {
    await setup();
    const strangerAuthId = randomUUID();
    await db.insert(user).values({
      organizationId: (await db.select().from(organization))[0].id,
      email: "stranger@example.com",
      name: "Stranger",
      authId: strangerAuthId,
    });

    const persons = await db.transaction(async (tx) => {
      await applyUserContext(tx, strangerAuthId);
      return tx.select().from(crosswalkPerson);
    });

    expect(persons).toEqual([]);
  });
});
