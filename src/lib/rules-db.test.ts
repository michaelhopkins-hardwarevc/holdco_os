// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  client,
  entity,
  indirectCode,
  organization,
  phase,
  project,
  resource,
  signalRule,
} from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-helpers";
import { recordRule } from "@/lib/rules-db";

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
    .values({ name: "O", slug: "o" })
    .returning();
  const [ent] = await db
    .insert(entity)
    .values({ organizationId: org.id, name: "E", type: "services" })
    .returning();
  const [res] = await db
    .insert(resource)
    .values({ organizationId: org.id, entityId: ent.id, name: "Ann" })
    .returning();
  const [cli] = await db
    .insert(client)
    .values({ organizationId: org.id, entityId: ent.id, name: "C" })
    .returning();
  const [proj] = await db
    .insert(project)
    .values({
      organizationId: org.id,
      entityId: ent.id,
      clientId: cli.id,
      code: "P1",
      name: "P",
      type: "time_materials",
    })
    .returning();
  const [ph] = await db
    .insert(phase)
    .values({ organizationId: org.id, entityId: ent.id, projectId: proj.id, name: "D" })
    .returning();
  const [ind] = await db
    .insert(indirectCode)
    .values({ organizationId: org.id, entityId: ent.id, code: "OH", category: "overhead" })
    .returning();
  return {
    actor: { orgId: org.id, actorId: res.id },
    entityId: ent.id,
    resourceId: res.id,
    proj,
    ph,
    ind,
  };
}

describe("recordRule", () => {
  it("creates a rule from a normalized subject", async () => {
    const s = await setup();
    await recordRule(db, s.actor, {
      entityId: s.entityId,
      resourceId: s.resourceId,
      subject: "  Design   Review ",
      charge: {
        chargeType: "project",
        projectId: s.proj.id,
        phaseId: s.ph.id,
        indirectCodeId: null,
      },
    });
    const rows = await db.select().from(signalRule);
    expect(rows).toHaveLength(1);
    expect(rows[0].matchValue).toBe("design review");
    expect(rows[0].projectId).toBe(s.proj.id);
    expect(rows[0].hitCount).toBe(1);
  });

  it("reinforces (bumps hit count) and can reassign the charge", async () => {
    const s = await setup();
    const base = { entityId: s.entityId, resourceId: s.resourceId, subject: "Standup" };
    const toProject = {
      chargeType: "project" as const,
      projectId: s.proj.id,
      phaseId: null,
      indirectCodeId: null,
    };
    await recordRule(db, s.actor, { ...base, charge: toProject });
    await recordRule(db, s.actor, { ...base, charge: toProject });
    // Reassign the same subject to an indirect code.
    await recordRule(db, s.actor, {
      ...base,
      charge: {
        chargeType: "indirect",
        projectId: null,
        phaseId: null,
        indirectCodeId: s.ind.id,
      },
    });

    const rows = await db.select().from(signalRule).where(eq(signalRule.matchValue, "standup"));
    expect(rows).toHaveLength(1);
    expect(rows[0].hitCount).toBe(3);
    expect(rows[0].chargeType).toBe("indirect");
    expect(rows[0].indirectCodeId).toBe(s.ind.id);
    expect(rows[0].projectId).toBeNull();
  });

  it("ignores a charge with no target", async () => {
    const s = await setup();
    await recordRule(db, s.actor, {
      entityId: s.entityId,
      resourceId: s.resourceId,
      subject: "Empty",
      charge: { chargeType: "project", projectId: null, phaseId: null, indirectCodeId: null },
    });
    expect(await db.select().from(signalRule)).toHaveLength(0);
  });
});
