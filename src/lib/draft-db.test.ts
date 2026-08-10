// @vitest-environment node
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activityEvent, entity, project, resource, signal } from "@/db/schema";
import { seed } from "@/db/seed";
import { createTestDb, type TestDb } from "@/db/test-helpers";
import { draftForEntity, draftSignalsForResource } from "@/lib/draft-db";

let pg: TestDb["pg"];
let db: TestDb["db"];

beforeEach(async () => {
  ({ pg, db } = await createTestDb());
});
afterEach(async () => {
  await pg.close();
});

const RANGE = { start: "2026-07-27T00:00:00Z", end: "2026-07-28T00:00:00Z" };

async function setup() {
  await seed(db);
  const [ent] = await db.select().from(entity);
  const [res] = await db
    .select()
    .from(resource)
    .where(eq(resource.entityId, ent.id));
  const [proj] = await db
    .select()
    .from(project)
    .where(eq(project.entityId, ent.id));
  const scope = { organizationId: ent.organizationId, entityId: ent.id };
  const actor = { orgId: ent.organizationId, actorId: null };

  const ev = (over: {
    id?: string;
    at: string;
    hardness?: "hard" | "soft";
    projectId?: string | null;
    conf?: "high" | "med" | "low" | null;
  }) =>
    db.insert(activityEvent).values({
      ...scope,
      personId: res.id,
      sourceSystem: "monday",
      sourceEventId: over.id ?? over.at,
      eventType: "monday_status",
      occurredAt: new Date(over.at),
      hardness: over.hardness ?? "hard",
      resolvedProjectId: over.projectId ?? null,
      resolvedClientId: over.projectId ? proj.clientId : null,
      resolutionConfidence: over.conf ?? (over.projectId ? "high" : null),
    });

  return { ent, res, proj, actor, ev };
}

describe("draftSignalsForResource", () => {
  it("clusters resolved events into a pre-charged draft and unresolved into a blank one", async () => {
    const { ent, res, proj, actor, ev } = await setup();
    await ev({ id: "a", at: "2026-07-27T09:00:00Z", projectId: proj.id });
    await ev({ id: "b", at: "2026-07-27T09:30:00Z", projectId: proj.id });
    await ev({
      id: "c",
      at: "2026-07-27T11:00:00Z",
      hardness: "soft",
      projectId: null,
    });

    const summary = await draftSignalsForResource(
      db,
      actor,
      ent.id,
      res.id,
      RANGE,
    );
    expect(summary).toMatchObject({ blocks: 2, resolved: 1, unresolved: 1 });

    const signals = await db
      .select()
      .from(signal)
      .where(
        and(eq(signal.resourceId, res.id), eq(signal.provider, "activity")),
      );
    expect(signals).toHaveLength(2);

    const resolved = signals.find((s) => s.projectId === proj.id)!;
    expect(resolved).toMatchObject({
      projectId: proj.id,
      billable: true,
      confidence: "high",
      proposedHours: "2.00", // 09:00 -> next block start 11:00
      state: "open",
    });

    const unresolved = signals.find((s) => s.projectId === null)!;
    expect(unresolved).toMatchObject({
      projectId: null,
      billable: false,
      confidence: "low",
      proposedHours: "0.50", // lone point event
    });
  });

  it("is idempotent: re-drafting updates in place, no duplicates", async () => {
    const { ent, res, proj, actor, ev } = await setup();
    await ev({ id: "a", at: "2026-07-27T09:00:00Z", projectId: proj.id });

    await draftSignalsForResource(db, actor, ent.id, res.id, RANGE);
    await draftSignalsForResource(db, actor, ent.id, res.id, RANGE);

    const signals = await db
      .select()
      .from(signal)
      .where(
        and(eq(signal.resourceId, res.id), eq(signal.provider, "activity")),
      );
    expect(signals).toHaveLength(1);
  });

  it("never overwrites a draft the person already accepted", async () => {
    const { ent, res, proj, actor, ev } = await setup();
    await ev({ id: "a", at: "2026-07-27T09:00:00Z", projectId: proj.id });
    await draftSignalsForResource(db, actor, ent.id, res.id, RANGE);

    // The person accepts it.
    await db
      .update(signal)
      .set({ state: "accepted" })
      .where(
        and(eq(signal.resourceId, res.id), eq(signal.provider, "activity")),
      );

    // A later re-draft (more events would change hours) must not touch it.
    await ev({ id: "b", at: "2026-07-27T09:30:00Z", projectId: proj.id });
    await draftSignalsForResource(db, actor, ent.id, res.id, RANGE);

    const [s] = await db
      .select()
      .from(signal)
      .where(
        and(eq(signal.resourceId, res.id), eq(signal.provider, "activity")),
      );
    expect(s.state).toBe("accepted");
    expect(s.proposedHours).toBe("0.50"); // unchanged from the single-event draft
  });
});

describe("draftForEntity", () => {
  it("drafts for every resource with captured activity in the window", async () => {
    await seed(db);
    const [ent] = await db.select().from(entity);
    const [proj] = await db
      .select()
      .from(project)
      .where(eq(project.entityId, ent.id));
    const resources = await db
      .select()
      .from(resource)
      .where(eq(resource.entityId, ent.id));
    const [r1, r2] = resources;
    const scope = { organizationId: ent.organizationId, entityId: ent.id };
    const actor = { orgId: ent.organizationId, actorId: null };

    for (const [i, r] of [r1, r2].entries()) {
      await db.insert(activityEvent).values({
        ...scope,
        personId: r.id,
        sourceSystem: "monday",
        sourceEventId: `e-${i}`,
        eventType: "monday_status",
        occurredAt: new Date("2026-07-27T09:00:00Z"),
        hardness: "hard",
        resolvedProjectId: proj.id,
        resolvedClientId: proj.clientId,
        resolutionConfidence: "high",
      });
    }

    const summary = await draftForEntity(db, actor, ent.id, RANGE);
    expect(summary.resources).toBe(2);
    expect(summary.blocks).toBe(2);

    const drafted = await db
      .select()
      .from(signal)
      .where(eq(signal.provider, "activity"));
    expect(drafted.map((s) => s.resourceId).sort()).toEqual(
      [r1.id, r2.id].sort(),
    );
  });
});
