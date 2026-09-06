// @vitest-environment node
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  activityEvent,
  client,
  crosswalkParty,
  crosswalkProject,
  entity,
  organization,
  project,
  resource,
} from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-helpers";
import { learnFromAcceptance, mapSourceRefToProject } from "@/lib/learn-db";

let pg: TestDb["pg"];
let db: TestDb["db"];
beforeEach(async () => {
  ({ pg, db } = await createTestDb());
});
afterEach(async () => {
  await pg.close();
});

async function setup() {
  const [org] = await db.insert(organization).values({ name: "O", slug: "o" }).returning();
  const [ent] = await db
    .insert(entity)
    .values({ organizationId: org.id, name: "E", type: "services" })
    .returning();
  const [cli] = await db
    .insert(client)
    .values({ organizationId: org.id, entityId: ent.id, name: "Acme" })
    .returning();
  const mkProject = (code: string) =>
    db
      .insert(project)
      .values({ organizationId: org.id, entityId: ent.id, clientId: cli.id, code, name: code, type: "time_materials" })
      .returning()
      .then((r) => r[0]);
  const p1 = await mkProject("P1");
  const p2 = await mkProject("P2");
  const [res] = await db
    .insert(resource)
    .values({ organizationId: org.id, entityId: ent.id, name: "Ann", billRate: 1, costRate: 1 })
    .returning();
  const actor = { orgId: org.id, actorId: null };
  const ev = (id: string, ref: string) =>
    db.insert(activityEvent).values({
      organizationId: org.id,
      entityId: ent.id,
      personId: res.id,
      sourceSystem: "monday",
      sourceEventId: id,
      eventType: "monday_status",
      occurredAt: new Date("2026-08-03T09:00:00Z"),
      hardness: "hard",
      sourceRef: ref,
      matchedBy: "none",
    });
  return { org, ent, cli, p1, p2, res, actor, ev };
}

describe("learnFromAcceptance", () => {
  it("maps a board ref to the project and re-resolves the events that carried it", async () => {
    const s = await setup();
    await s.ev("a", "monday_board:123");
    await s.ev("b", "monday_board:123");

    const out = await learnFromAcceptance(db, s.actor, {
      entityId: s.ent.id,
      hints: ["monday_board:123"],
      projectId: s.p1.id,
    });
    expect(out.mapped).toEqual(["monday_board:123"]);
    expect(out.reResolved).toBe(2);

    const [xw] = await db
      .select()
      .from(crosswalkProject)
      .where(and(eq(crosswalkProject.entityId, s.ent.id), eq(crosswalkProject.projectId, s.p1.id)));
    expect(xw.mondayBoardId).toBe("123");
    expect(xw.clientId).toBe(s.cli.id);

    const events = await db.select().from(activityEvent).where(eq(activityEvent.entityId, s.ent.id));
    expect(events.every((e) => e.resolvedProjectId === s.p1.id)).toBe(true);
    expect(events.every((e) => e.matchedBy === "monday_board")).toBe(true);
  });

  it("maps an email domain to the project's client (not the project)", async () => {
    const s = await setup();
    await s.ev("m", "email_domain:acme.com");
    const out = await learnFromAcceptance(db, s.actor, {
      entityId: s.ent.id,
      hints: ["email_domain:acme.com"],
      projectId: s.p1.id,
    });
    expect(out.mapped).toEqual(["email_domain:acme.com"]);
    const [party] = await db.select().from(crosswalkParty).where(eq(crosswalkParty.entityId, s.ent.id));
    expect(party.matchType).toBe("email_domain");
    expect(party.matchValue).toBe("acme.com");
    expect(party.clientId).toBe(s.cli.id);
    const [e] = await db.select().from(activityEvent).where(eq(activityEvent.sourceEventId, "m"));
    expect(e.resolvedClientId).toBe(s.cli.id);
    expect(e.resolvedProjectId).toBeNull();
  });

  it("never overwrites a ref another project already claims", async () => {
    const s = await setup();
    await mapSourceRefToProject(db, s.actor, s.ent.id, "hubspot_deal:9", s.p1.id);
    const out = await mapSourceRefToProject(db, s.actor, s.ent.id, "hubspot_deal:9", s.p2.id);
    expect(out.mapped).toEqual([]);
    expect(out.skipped).toEqual(["hubspot_deal:9"]);
    const rows = await db.select().from(crosswalkProject).where(eq(crosswalkProject.entityId, s.ent.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].projectId).toBe(s.p1.id);
  });
});
