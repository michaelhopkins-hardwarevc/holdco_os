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
  signal,
  signalRule,
  timeEntry,
} from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-helpers";
import {
  acceptSignal,
  dismissSignal,
} from "@/lib/signals-db";
import { submitTimesheetWeek } from "@/lib/timesheet-db";

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
    .values({
      organizationId: org.id,
      entityId: ent.id,
      name: "Ann",
      billRate: 22500,
      costRate: 9000,
    })
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
    .values({ organizationId: org.id, entityId: ent.id, code: "PTO", category: "pto" })
    .returning();

  const actor = { orgId: org.id, actorId: res.id };
  const rates = { billRate: res.billRate, costRate: res.costRate };
  return { org, ent, res, proj, ph, ind, actor, rates };
}

async function makeSignal(s: Awaited<ReturnType<typeof setup>>, over: Partial<typeof signal.$inferInsert>) {
  const [row] = await db
    .insert(signal)
    .values({
      organizationId: s.org.id,
      entityId: s.ent.id,
      resourceId: s.res.id,
      workDate: "2026-07-27",
      provider: "google_calendar",
      externalId: `ext-${Math.round(Number(over.proposedHours ?? 1) * 1000)}-${over.chargeType}`,
      evidence: "Design review",
      chargeType: "project",
      proposedHours: "4.00",
      ...over,
    })
    .returning();
  return row;
}

describe("acceptSignal", () => {
  it("creates a draft time entry with correct amounts and links the signal", async () => {
    const s = await setup();
    const sig = await makeSignal(s, {
      chargeType: "project",
      projectId: s.proj.id,
      phaseId: s.ph.id,
      proposedHours: "4.00",
      billable: true,
    });

    const entryId = await acceptSignal(db, s.actor, s.rates, sig);
    expect(entryId).toBeTruthy();

    const [entry] = await db
      .select()
      .from(timeEntry)
      .where(eq(timeEntry.id, entryId!));
    expect(entry.status).toBe("draft");
    expect(Number(entry.hours)).toBe(4);
    expect(entry.billableAmount).toBe(90000); // 4 * 22500
    expect(entry.costAmount).toBe(36000); // 4 * 9000

    const [after] = await db.select().from(signal).where(eq(signal.id, sig.id));
    expect(after.state).toBe("accepted");
    expect(after.timeEntryId).toBe(entryId);
  });

  it("never bills an indirect signal", async () => {
    const s = await setup();
    const sig = await makeSignal(s, {
      chargeType: "indirect",
      indirectCodeId: s.ind.id,
      proposedHours: "8.00",
      billable: true, // even if flagged, indirect never bills
    });
    const entryId = await acceptSignal(db, s.actor, s.rates, sig);
    const [entry] = await db.select().from(timeEntry).where(eq(timeEntry.id, entryId!));
    expect(entry.billable).toBe(false);
    expect(entry.billableAmount).toBe(0);
    expect(entry.costAmount).toBe(72000);
  });

  it("teaches a rule from the accepted charge", async () => {
    const s = await setup();
    const sig = await makeSignal(s, {
      chargeType: "project",
      projectId: s.proj.id,
      phaseId: s.ph.id,
      evidence: "Weekly Design Review",
    });
    await acceptSignal(db, s.actor, s.rates, sig);
    const rules = await db.select().from(signalRule);
    expect(rules).toHaveLength(1);
    expect(rules[0].matchValue).toBe("weekly design review");
    expect(rules[0].projectId).toBe(s.proj.id);
  });

  it("uses the user's charge override instead of the guess", async () => {
    const s = await setup();
    // Signal guessed a project, but the user reassigns it to an indirect code.
    const sig = await makeSignal(s, {
      chargeType: "project",
      projectId: s.proj.id,
      phaseId: s.ph.id,
      proposedHours: "2.00",
      billable: true,
    });
    const entryId = await acceptSignal(db, s.actor, s.rates, sig, {
      chargeType: "indirect",
      projectId: null,
      phaseId: null,
      indirectCodeId: s.ind.id,
    });
    const [entry] = await db
      .select()
      .from(timeEntry)
      .where(eq(timeEntry.id, entryId!));
    expect(entry.chargeType).toBe("indirect");
    expect(entry.indirectCodeId).toBe(s.ind.id);
    expect(entry.billable).toBe(false);
    expect(entry.billableAmount).toBe(0);

    const [after] = await db.select().from(signal).where(eq(signal.id, sig.id));
    expect(after.chargeType).toBe("indirect");
    expect(after.indirectCodeId).toBe(s.ind.id);
  });

  it("is idempotent: accepting twice makes one entry", async () => {
    const s = await setup();
    const sig = await makeSignal(s, {
      chargeType: "project",
      projectId: s.proj.id,
      phaseId: s.ph.id,
      proposedHours: "4.00",
    });
    const first = await acceptSignal(db, s.actor, s.rates, sig);
    const [reloaded] = await db.select().from(signal).where(eq(signal.id, sig.id));
    const second = await acceptSignal(db, s.actor, s.rates, reloaded);
    expect(second).toBe(first);
    const entries = await db.select().from(timeEntry);
    expect(entries).toHaveLength(1);
  });

  it("refuses to accept into a locked week", async () => {
    const s = await setup();
    const sig1 = await makeSignal(s, {
      chargeType: "project",
      projectId: s.proj.id,
      phaseId: s.ph.id,
      proposedHours: "4.00",
      externalId: "a",
    });
    await acceptSignal(db, s.actor, s.rates, sig1);
    await submitTimesheetWeek(db, s.actor, s.ent.id, s.res.id, "2026-07-27");

    const sig2 = await makeSignal(s, {
      chargeType: "project",
      projectId: s.proj.id,
      phaseId: s.ph.id,
      proposedHours: "2.00",
      externalId: "b",
    });
    await expect(acceptSignal(db, s.actor, s.rates, sig2)).rejects.toThrow();
  });
});

describe("dismissSignal", () => {
  it("marks a signal dismissed and writes no time entry", async () => {
    const s = await setup();
    const sig = await makeSignal(s, {
      chargeType: "project",
      projectId: s.proj.id,
      phaseId: s.ph.id,
    });
    await dismissSignal(db, s.actor, sig);
    const [after] = await db.select().from(signal).where(eq(signal.id, sig.id));
    expect(after.state).toBe("dismissed");
    expect(await db.select().from(timeEntry)).toHaveLength(0);
  });
});
