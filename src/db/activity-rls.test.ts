// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyUserContext } from "./rls";
import {
  activityEvent,
  entity,
  membership,
  organization,
  user,
} from "./schema";
import { createTestDb, type TestDb } from "./test-helpers";

// activity_event honors the same entity isolation as the rest of the schema.
let pg: TestDb["pg"];
let db: TestDb["db"];

beforeEach(async () => {
  ({ pg, db } = await createTestDb());
});

afterEach(async () => {
  await pg.close();
});

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

  for (const [ent, tag] of [
    [entA, "aaa"],
    [entB, "bbb"],
  ] as const) {
    await db.insert(activityEvent).values({
      organizationId: org.id,
      entityId: ent.id,
      sourceSystem: "monday",
      sourceEventId: `evt-${tag}`,
      eventType: "monday_status",
      occurredAt: new Date("2026-07-27T09:00:00Z"),
      hardness: "hard",
    });
  }

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

  return { staffAuthId };
}

describe("activity_event row-level security", () => {
  it("a staff user sees only their own entity's activity events", async () => {
    const s = await setup();
    const rows = await db.transaction(async (tx) => {
      await applyUserContext(tx, s.staffAuthId);
      return tx.select().from(activityEvent);
    });
    expect(rows.map((r) => r.sourceEventId)).toEqual(["evt-aaa"]);
  });
});
