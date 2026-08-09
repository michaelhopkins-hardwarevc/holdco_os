// @vitest-environment node
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activityEvent, entity, user } from "@/db/schema";
import { seed } from "@/db/seed";
import { createTestDb, type TestDb } from "@/db/test-helpers";
import { captureActivities } from "@/lib/capture-db";
import type { RawActivity } from "@/lib/integrations/capture";
import { graphMailToActivities } from "@/lib/integrations/graph-mail";
import { hubspotToActivities } from "@/lib/integrations/hubspot";
import { mondayToActivities } from "@/lib/integrations/monday";

// M1 acceptance: a day of one person's real-shaped events across sources is
// captured into activity_event, and the hard signals resolve to a project via
// the seeded crosswalks. Runs the full path: map -> capture -> resolve -> store.
let pg: TestDb["pg"];
let db: TestDb["db"];

beforeEach(async () => {
  ({ pg, db } = await createTestDb());
});

afterEach(async () => {
  await pg.close();
});

// A day of Ryan Hahn's work across the three sources, using the seeded external
// ids (monday-board-6041 = GermPass, hs-deal-6055 = Plow, biosciencetech.com =
// MicroLumix).
function aDayOfEvents(): RawActivity[] {
  return [
    ...mondayToActivities([
      {
        id: "log-1",
        created_at: "2026-07-27T09:15:00Z",
        creator_id: "monday-ryan",
        board_id: "monday-board-6041",
        kind: "status_change",
      },
    ]),
    ...hubspotToActivities([
      {
        id: "eng-1",
        type: "NOTE",
        timestamp: "2026-07-27T11:00:00Z",
        ownerId: "hs-ryan",
        dealId: "hs-deal-6055",
      },
    ]),
    ...graphMailToActivities(
      [
        {
          id: "mail-1",
          sentDateTime: "2026-07-27T15:30:00Z",
          subject: "GermPass status",
          toRecipients: [
            { emailAddress: { address: "chris@biosciencetech.com" } },
          ],
        },
        {
          id: "mail-2",
          sentDateTime: "2026-07-27T16:00:00Z",
          subject: "internal sync",
          toRecipients: [
            { emailAddress: { address: "boss@brooksstevens.com" } },
          ],
        },
      ],
      "entra-ryan-hahn",
      { internalDomains: ["brooksstevens.com"] },
    ),
  ];
}

// Seed the sample entity and build an actor from a real seeded user id (the
// service-role writer stamps created_by/updated_by, which must be valid uuids).
async function seedAndActor() {
  await seed(db);
  const [ent] = await db.select().from(entity);
  const [u] = await db.select().from(user);
  return { ent, actor: { orgId: ent.organizationId, actorId: u.id } };
}

describe("captureActivities", () => {
  it("captures a day of events and resolves the hard signals to a project", async () => {
    const { ent, actor } = await seedAndActor();

    const summary = await captureActivities(db, actor, ent.id, aDayOfEvents());

    // 4 events landed: monday status, hubspot note, 2 sent mails.
    expect(summary.captured).toBe(4);
    // monday_status (GermPass) + hubspot_note (Plow) resolve to a project.
    expect(summary.resolvedToProject).toBe(2);
    // The external email resolves to a client (MicroLumix) but no project.
    expect(summary.resolvedToClientOnly).toBe(1);
    // The all-internal email resolves to nothing.
    expect(summary.unresolved).toBe(1);
    expect(summary.hard).toBe(4);

    const rows = await db
      .select()
      .from(activityEvent)
      .where(eq(activityEvent.entityId, ent.id));
    expect(rows).toHaveLength(4);

    const status = rows.find((r) => r.sourceEventId === "log-1")!;
    expect(status.resolvedProjectId).not.toBeNull();
    expect(status.resolutionConfidence).toBe("high");
    expect(status.matchedBy).toBe("monday_board");

    const internalMail = rows.find((r) => r.sourceEventId === "mail-2")!;
    expect(internalMail.resolvedProjectId).toBeNull();
    expect(internalMail.resolvedClientId).toBeNull();
    expect(internalMail.resolutionConfidence).toBeNull();
    expect(internalMail.matchedBy).toBe("none");
  });

  it("resolves the actor to a person when the source id is crosswalked", async () => {
    const { ent, actor } = await seedAndActor();

    // Graph events use the seeded Entra id for Ryan Hahn.
    await captureActivities(
      db,
      actor,
      ent.id,
      graphMailToActivities(
        [
          {
            id: "mail-x",
            sentDateTime: "2026-07-27T15:30:00Z",
            toRecipients: [
              { emailAddress: { address: "chris@biosciencetech.com" } },
            ],
          },
        ],
        "entra-ryan-hahn",
      ),
    );

    const [row] = await db
      .select()
      .from(activityEvent)
      .where(eq(activityEvent.sourceEventId, "mail-x"));
    expect(row.personId).not.toBeNull();
  });

  it("is idempotent: re-capturing the same events does not duplicate", async () => {
    const { ent, actor } = await seedAndActor();

    await captureActivities(db, actor, ent.id, aDayOfEvents());
    const second = await captureActivities(db, actor, ent.id, aDayOfEvents());

    expect(second.captured).toBe(4);
    const rows = await db
      .select()
      .from(activityEvent)
      .where(eq(activityEvent.entityId, ent.id));
    expect(rows).toHaveLength(4); // upserted in place, not duplicated
  });

  it("returns an empty summary for no events", async () => {
    const { ent, actor } = await seedAndActor();
    const summary = await captureActivities(db, actor, ent.id, []);
    expect(summary.captured).toBe(0);
    const rows = await db
      .select()
      .from(activityEvent)
      .where(and(eq(activityEvent.entityId, ent.id)));
    expect(rows).toHaveLength(0);
  });
});
