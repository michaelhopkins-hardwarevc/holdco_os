// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  client,
  entity,
  indirectCode,
  organization,
  phase,
  project,
  resource,
  signal,
} from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-helpers";
import { type Charge, chargeKey, consistencyNudge } from "@/lib/consistency";
import { listPeerChargesForSharedIds } from "@/lib/queries";

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
  const [proj] = await db
    .insert(project)
    .values({ organizationId: org.id, entityId: ent.id, clientId: cli.id, code: "P1", name: "Proj", type: "time_materials" })
    .returning();
  const [ph] = await db
    .insert(phase)
    .values({ organizationId: org.id, entityId: ent.id, projectId: proj.id, name: "Design" })
    .returning();
  const [ind] = await db
    .insert(indirectCode)
    .values({ organizationId: org.id, entityId: ent.id, code: "OH", category: "overhead" })
    .returning();
  const mkRes = (name: string) =>
    db
      .insert(resource)
      .values({ organizationId: org.id, entityId: ent.id, name, billRate: 20000, costRate: 8000 })
      .returning()
      .then((r) => r[0]);
  const a = await mkRes("A");
  const b = await mkRes("B");
  const c = await mkRes("C");

  // A and B accepted the same meeting (shared id M1) to project P1 / Design.
  const acceptedToProject = (res: string, ext: string) =>
    db.insert(signal).values({
      organizationId: org.id,
      entityId: ent.id,
      resourceId: res,
      workDate: "2026-08-04",
      provider: "outlook",
      externalId: ext,
      sharedId: "M1",
      evidence: "Design review",
      chargeType: "project",
      projectId: proj.id,
      phaseId: ph.id,
      proposedHours: "1.00",
      confidence: "high",
      billable: true,
      state: "accepted",
    });
  await acceptedToProject(a.id, "a-1");
  await acceptedToProject(b.id, "b-1");

  return { org, ent, proj, ph, ind, a, b, c };
}

describe("consistency nudge (DB)", () => {
  it("nudges C, who proposed Overhead, toward the project 2 teammates billed", async () => {
    const s = await setup();

    const rows = await listPeerChargesForSharedIds(db, s.ent.id, s.c.id, ["M1"]);
    expect(rows).toHaveLength(2); // A and B, not C

    const peers = rows.map((r) => ({
      charge: {
        chargeType: r.chargeType,
        projectId: r.projectId,
        phaseId: r.phaseId,
        indirectCodeId: r.indirectCodeId,
      } as Charge,
      label: r.projectCode ?? r.indirectCodeLabel ?? "?",
    }));

    // C's own proposed charge is Overhead (indirect).
    const myCharge: Charge = {
      chargeType: "indirect",
      projectId: null,
      phaseId: null,
      indirectCodeId: s.ind.id,
    };
    const nudge = consistencyNudge(chargeKey(myCharge), peers);
    expect(nudge).not.toBeNull();
    expect(nudge!.agree).toBe(2);
    expect(nudge!.total).toBe(2);
    expect(nudge!.label).toBe("P1");
    expect(nudge!.value).toBe(`project:${s.proj.id}:${s.ph.id}`);
  });

  it("excludes the person's own accepted signals and other meetings", async () => {
    const s = await setup();
    // C already accepted a DIFFERENT meeting (M2); it must not count as a peer.
    await db.insert(signal).values({
      organizationId: s.org.id,
      entityId: s.ent.id,
      resourceId: s.c.id,
      workDate: "2026-08-04",
      provider: "outlook",
      externalId: "c-2",
      sharedId: "M2",
      evidence: "Other",
      chargeType: "indirect",
      indirectCodeId: s.ind.id,
      proposedHours: "1.00",
      confidence: "high",
      billable: false,
      state: "accepted",
    });
    const rows = await listPeerChargesForSharedIds(db, s.ent.id, s.c.id, ["M1"]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.sharedId === "M1")).toBe(true);
  });
});
