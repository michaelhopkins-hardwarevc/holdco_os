// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activityEvent, entity, user } from "@/db/schema";
import { seed } from "@/db/seed";
import { createTestDb, type TestDb } from "@/db/test-helpers";
import { runCapture, type Fetcher } from "@/lib/capture-sync";
import type { RawActivity } from "@/lib/integrations/capture";

let pg: TestDb["pg"];
let db: TestDb["db"];

beforeEach(async () => {
  ({ pg, db } = await createTestDb());
});
afterEach(async () => {
  await pg.close();
});

async function seedAndActor() {
  await seed(db);
  const [ent] = await db.select().from(entity);
  const [u] = await db.select().from(user);
  return { ent, actor: { orgId: ent.organizationId, actorId: u.id } };
}

const raw = (over: Partial<RawActivity>): RawActivity => ({
  sourceSystem: "monday",
  sourceUserId: "x",
  sourceEventId: "e",
  eventType: "monday_status",
  occurredAt: "2026-07-27T09:00:00Z",
  hardness: "hard",
  raw: {},
  ...over,
});

describe("runCapture", () => {
  it("gathers from every source and captures them", async () => {
    const { ent, actor } = await seedAndActor();
    const fetchers: Fetcher[] = [
      {
        label: "monday",
        run: async () => [
          raw({ sourceEventId: "m1", mondayBoardId: "monday-board-6041" }),
        ],
      },
      {
        label: "hubspot",
        run: async () => [
          raw({
            sourceEventId: "h1",
            sourceSystem: "hubspot",
            eventType: "hubspot_note",
            hubspotDealId: "hs-deal-6055",
          }),
        ],
      },
    ];

    const result = await runCapture(db, actor, ent.id, fetchers);

    expect(result.sourcesRun).toBe(2);
    expect(result.errors).toEqual([]);
    expect(result.captured).toBe(2);
    expect(result.resolvedToProject).toBe(2);
    const rows = await db.select().from(activityEvent);
    expect(rows).toHaveLength(2);
  });

  it("isolates a failing source without losing the others", async () => {
    const { ent, actor } = await seedAndActor();
    const fetchers: Fetcher[] = [
      {
        label: "monday",
        run: async () => [
          raw({ sourceEventId: "m1", mondayBoardId: "monday-board-6041" }),
        ],
      },
      {
        label: "hubspot",
        run: async () => {
          throw new Error("401 token expired");
        },
      },
    ];

    const result = await runCapture(db, actor, ent.id, fetchers);

    expect(result.captured).toBe(1); // monday still landed
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("hubspot: 401 token expired");
    expect(await db.select().from(activityEvent)).toHaveLength(1);
  });

  it("handles no sources / no events", async () => {
    const { ent, actor } = await seedAndActor();
    const result = await runCapture(db, actor, ent.id, []);
    expect(result).toMatchObject({ sourcesRun: 0, captured: 0, errors: [] });
  });
});
