// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { client, entity, project } from "@/db/schema";
import { seed } from "@/db/seed";
import { createTestDb, type TestDb } from "@/db/test-helpers";
import { loadCrosswalks } from "@/lib/crosswalk-db";
import { resolveEvent, type WorkEvent } from "@/lib/crosswalk-map";

// M0 acceptance: the seeded crosswalks resolve a hand-picked sample of last
// week's real-shaped events to the right project (or the right client when no
// project is implicated). Runs the full path: seed -> load from Postgres (PGlite)
// -> resolve.
let pg: TestDb["pg"];
let db: TestDb["db"];

beforeEach(async () => {
  ({ pg, db } = await createTestDb());
});

afterEach(async () => {
  await pg.close();
});

describe("crosswalk resolution over the seeded entity", () => {
  it("resolves last week's sample events to the expected project or client", async () => {
    await seed(db);

    const [ent] = await db.select().from(entity);
    const xwalks = await loadCrosswalks(db, ent.id);

    // id -> label lookups so assertions read in business terms.
    const projById = Object.fromEntries(
      (await db.select().from(project)).map((p) => [p.id, p.code]),
    );
    const clientById = Object.fromEntries(
      (await db.select().from(client)).map((c) => [c.id, c.name]),
    );

    // A hand-picked week of events, one per capture source, using the seeded
    // external ids. Each carries what we expect it to resolve to.
    const cases: Array<{
      what: string;
      event: WorkEvent;
      project: string | null;
      client: string | null;
      confidence: string;
    }> = [
      {
        what: "Monday status change on the GermPass board",
        event: {
          sourceSystem: "monday",
          sourceUserId: "monday-unknown",
          mondayBoardId: "monday-board-6041",
        },
        project: "P-6041",
        client: "MicroLumix (Bioscience Technologies)",
        confidence: "high",
      },
      {
        what: "HubSpot note on the Plow deal",
        event: {
          sourceSystem: "hubspot",
          sourceUserId: "hs-unknown",
          hubspotDealId: "hs-deal-6055",
        },
        project: "P-6055",
        client: "LeMans Corporation",
        confidence: "high",
      },
      {
        what: "SharePoint file saved in a Lighting sub-folder",
        event: {
          sourceSystem: "microsoft",
          sourceUserId: "entra-casey-designer",
          sharepointFolder: "/clients/jwspeaker/lighting-strategy/concepts",
        },
        project: "P-6060",
        client: "J.W. Speaker",
        confidence: "med",
      },
      {
        what: "Sent email to a MicroLumix address (no project implicated)",
        event: {
          sourceSystem: "microsoft",
          sourceUserId: "entra-ryan-hahn",
          senderDomain: "biosciencetech.com",
        },
        project: null,
        client: "MicroLumix (Bioscience Technologies)",
        confidence: "med",
      },
      {
        what: "Unknown external item — unresolved, goes to the queue",
        event: {
          sourceSystem: "monday",
          sourceUserId: "monday-unknown",
          mondayBoardId: "monday-board-9999",
        },
        project: null,
        client: null,
        confidence: "low",
      },
    ];

    for (const c of cases) {
      const r = resolveEvent(c.event, xwalks);
      expect(r.projectId ? projById[r.projectId] : null, c.what).toBe(
        c.project,
      );
      expect(r.clientId ? clientById[r.clientId] : null, c.what).toBe(c.client);
      expect(r.confidence, c.what).toBe(c.confidence);
    }
  });

  it("attributes an event to the right person via the person crosswalk", async () => {
    await seed(db);
    const [ent] = await db.select().from(entity);
    const xwalks = await loadCrosswalks(db, ent.id);

    const r = resolveEvent(
      {
        sourceSystem: "microsoft",
        sourceUserId: "entra-ryan-hahn",
        mondayBoardId: "monday-board-6041",
      },
      xwalks,
    );

    const ryan = xwalks.persons.find(
      (p) => p.sourceUserId === "entra-ryan-hahn",
    );
    expect(r.resourceId).toBe(ryan?.resourceId);
    expect(r.resourceId).not.toBeNull();
  });
});
