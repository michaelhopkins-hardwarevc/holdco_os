// @vitest-environment node
import { and, eq, isNull } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  activityEvent,
  client,
  crosswalkParty,
  entity,
  indirectCode,
  project,
  resource,
  sourceConnection,
  sourceRefRule,
  user,
} from "@/db/schema";
import { seed } from "@/db/seed";
import { createTestDb, type TestDb } from "@/db/test-helpers";
import { captureActivities } from "@/lib/capture-db";
import type { RawActivity } from "@/lib/integrations/capture";
import { graphMailToActivities } from "@/lib/integrations/graph-mail";
import { hubspotV3ToActivities } from "@/lib/integrations/hubspot";
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
    ...hubspotV3ToActivities(
      [
        {
          id: "eng-1",
          properties: {
            hs_timestamp: "2026-07-27T11:00:00Z",
            hubspot_owner_id: "hs-ryan",
          },
          associations: { deals: { results: [{ id: "hs-deal-6055" }] } },
        },
      ],
      "note",
    ),
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
  it("resolves a titled event to a project via subject matching when crosswalks miss", async () => {
    const { ent, actor } = await seedAndActor();
    // Calendar-style event: known person (seeded Entra id), subject carries a
    // real project code (P-6041), no board/deal/domain hint for the crosswalks.
    await captureActivities(db, actor, ent.id, [
      {
        sourceSystem: "microsoft",
        sourceUserId: "entra-ryan-hahn",
        sourceEventId: "cal-1",
        eventType: "calendar_meeting",
        occurredAt: "2026-07-27T09:00:00Z",
        hardness: "hard",
        subject: "P-6041 design review",
        raw: {},
      },
    ]);

    const [row] = await db
      .select()
      .from(activityEvent)
      .where(eq(activityEvent.sourceEventId, "cal-1"));
    expect(row.resolvedProjectId).not.toBeNull();
    expect(row.matchedBy).toBe("subject");
    expect(row.personId).not.toBeNull();
  });

  it("captures a day of events and resolves the hard signals to a project", async () => {
    const { ent, actor } = await seedAndActor();

    const summary = await captureActivities(db, actor, ent.id, aDayOfEvents());

    // 4 events landed: monday status, hubspot note, 2 sent mails.
    expect(summary.captured).toBe(4);
    // monday_status (GermPass) + hubspot_note (Plow) resolve to a project, and
    // the external email reaches MicroLumix, whose only active project it then
    // charges to (single-project-client rule).
    expect(summary.resolvedToProject).toBe(3);
    expect(summary.resolvedToClientOnly).toBe(0);
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

  it("resolves a Microsoft identity from a connected mailbox with no crosswalk row", async () => {
    const { ent, actor } = await seedAndActor();
    // The seeded user has a linked resource; simulate their Outlook connection
    // with an Entra id nobody hand-loaded into crosswalk_person.
    const [u] = await db.select().from(user);
    const [res] = await db
      .select()
      .from(resource)
      .where(and(eq(resource.entityId, ent.id), eq(resource.userId, u.id)));
    expect(res).toBeTruthy();
    await db.insert(sourceConnection).values({
      organizationId: ent.organizationId,
      entityId: ent.id,
      userId: u.id,
      provider: "outlook",
      status: "connected",
      externalAccountId: "entra-live-only",
    });

    await captureActivities(
      db,
      actor,
      ent.id,
      graphMailToActivities(
        [
          {
            id: "mail-live",
            sentDateTime: "2026-07-27T15:30:00Z",
            subject: "Kickoff notes",
            toRecipients: [{ emailAddress: { address: "chris@biosciencetech.com" } }],
          },
        ],
        "entra-live-only",
      ),
    );
    const [row] = await db
      .select()
      .from(activityEvent)
      .where(eq(activityEvent.sourceEventId, "mail-live"));
    expect(row.personId).toBe(res.id);
    // Evidence fields land with the event.
    expect(row.subject).toBe("Kickoff notes");
    expect(row.counterparty).toBe("biosciencetech.com");
    expect(row.sourceRef).toBe("email_domain:biosciencetech.com");
  });

  it("stores a meeting's real end and the strongest source ref", async () => {
    const { ent, actor } = await seedAndActor();
    await captureActivities(db, actor, ent.id, [
      {
        sourceSystem: "microsoft",
        sourceUserId: "entra-ryan-hahn",
        sourceEventId: "cal-end",
        eventType: "calendar_meeting",
        occurredAt: "2026-07-27T09:00:00Z",
        endedAt: "2026-07-27T10:00:00Z",
        hardness: "hard",
        subject: "Standup",
        raw: {},
      },
      ...mondayToActivities([
        {
          id: "log-ref",
          created_at: "2026-07-27T09:15:00Z",
          creator_id: "monday-ryan",
          board_id: "monday-board-6041",
          kind: "status_change",
        },
      ]),
    ]);
    const [cal] = await db
      .select()
      .from(activityEvent)
      .where(eq(activityEvent.sourceEventId, "cal-end"));
    expect(cal.endedAt?.toISOString()).toBe("2026-07-27T10:00:00.000Z");
    const [mon] = await db
      .select()
      .from(activityEvent)
      .where(eq(activityEvent.sourceEventId, "log-ref"));
    expect(mon.sourceRef).toBe("monday_board:monday-board-6041");
  });

  it("charges a client-only event to the client's only active project", async () => {
    const { ent, actor } = await seedAndActor();
    // biosciencetech.com resolves to MicroLumix by domain. Retire all but one
    // of MicroLumix's active projects so the single-project rule applies.
    // Find MicroLumix through its seeded domain rule rather than its display name.
    const [party] = await db
      .select({ clientId: crosswalkParty.clientId })
      .from(crosswalkParty)
      .where(
        and(eq(crosswalkParty.entityId, ent.id), eq(crosswalkParty.matchValue, "biosciencetech.com")),
      );
    const [cli] = await db.select().from(client).where(eq(client.id, party.clientId));
    const projs = await db
      .select()
      .from(project)
      .where(and(eq(project.clientId, cli.id), isNull(project.deletedAt)));
    expect(projs.length).toBeGreaterThanOrEqual(1);
    for (const p of projs.slice(1)) {
      await db.update(project).set({ status: "closed" }).where(eq(project.id, p.id));
    }
    await captureActivities(
      db,
      actor,
      ent.id,
      graphMailToActivities(
        [
          {
            id: "mail-single",
            sentDateTime: "2026-07-27T15:30:00Z",
            toRecipients: [{ emailAddress: { address: "chris@biosciencetech.com" } }],
          },
        ],
        "entra-ryan-hahn",
      ),
    );
    const [row] = await db
      .select()
      .from(activityEvent)
      .where(eq(activityEvent.sourceEventId, "mail-single"));
    expect(row.resolvedProjectId).toBe(projs[0].id);
    expect(row.matchedBy).toBe("client_single_project");
    expect(row.resolutionConfidence).toBe("med");
  });

  it("an explicit source rule wins: indirect and ignore", async () => {
    const { ent, actor } = await seedAndActor();
    const [ind] = await db
      .select()
      .from(indirectCode)
      .where(and(eq(indirectCode.entityId, ent.id), isNull(indirectCode.deletedAt)))
      .limit(1);
    await db.insert(sourceRefRule).values([
      {
        organizationId: ent.organizationId,
        entityId: ent.id,
        sourceRef: "email_domain:marquette.edu",
        kind: "indirect",
        indirectCodeId: ind.id,
      },
      {
        organizationId: ent.organizationId,
        entityId: ent.id,
        sourceRef: "email_domain:gmail.com",
        kind: "ignore",
      },
    ]);
    await captureActivities(
      db,
      actor,
      ent.id,
      graphMailToActivities(
        [
          { id: "mail-bd", sentDateTime: "2026-07-27T10:00:00Z", toRecipients: [{ emailAddress: { address: "coach@marquette.edu" } }] },
          { id: "mail-personal", sentDateTime: "2026-07-27T11:00:00Z", toRecipients: [{ emailAddress: { address: "me@gmail.com" } }] },
        ],
        "entra-ryan-hahn",
      ),
    );
    const [bd] = await db.select().from(activityEvent).where(eq(activityEvent.sourceEventId, "mail-bd"));
    expect(bd.resolvedIndirectCodeId).toBe(ind.id);
    expect(bd.resolvedProjectId).toBeNull();
    expect(bd.matchedBy).toBe("rule_indirect");
    const [personal] = await db.select().from(activityEvent).where(eq(activityEvent.sourceEventId, "mail-personal"));
    expect(personal.matchedBy).toBe("ignored");
    expect(personal.resolvedProjectId).toBeNull();
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
