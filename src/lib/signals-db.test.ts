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
import { acceptSignal, dismissSignal } from "@/lib/signals-db";
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
    .values({
      organizationId: org.id,
      entityId: ent.id,
      projectId: proj.id,
      name: "D",
    })
    .returning();
  const [ind] = await db
    .insert(indirectCode)
    .values({
      organizationId: org.id,
      entityId: ent.id,
      code: "PTO",
      category: "pto",
    })
    .returning();

  const actor = { orgId: org.id, actorId: res.id };
  const rates = { billRate: res.billRate, costRate: res.costRate };
  return { org, ent, res, proj, ph, ind, actor, rates };
}

async function makeSignal(
  s: Awaited<ReturnType<typeof setup>>,
  over: Partial<typeof signal.$inferInsert>,
) {
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
  it("creates an approved time entry (confirmed = approved) with correct amounts and links the signal", async () => {
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
    expect(entry.status).toBe("approved");
    expect(Number(entry.hours)).toBe(4);
    expect(entry.billableAmount).toBe(90000); // 4 * 22500
    expect(entry.costAmount).toBe(36000); // 4 * 9000

    const [after] = await db.select().from(signal).where(eq(signal.id, sig.id));
    expect(after.state).toBe("accepted");
    expect(after.timeEntryId).toBe(entryId);
  });

  it("skips an unresolved draft (no charge target) and leaves it open", async () => {
    const s = await setup();
    const sig = await makeSignal(s, {
      chargeType: "project",
      projectId: null, // unresolved activity draft — needs the person to link
      proposedHours: "2.00",
      billable: false,
      provider: "activity",
    });

    const entryId = await acceptSignal(db, s.actor, s.rates, sig);
    expect(entryId).toBeNull();

    const entries = await db
      .select()
      .from(timeEntry)
      .where(eq(timeEntry.resourceId, s.res.id));
    expect(entries).toHaveLength(0);

    const [after] = await db.select().from(signal).where(eq(signal.id, sig.id));
    expect(after.state).toBe("open"); // still there to link
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
    const [entry] = await db
      .select()
      .from(timeEntry)
      .where(eq(timeEntry.id, entryId!));
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
    const [reloaded] = await db
      .select()
      .from(signal)
      .where(eq(signal.id, sig.id));
    const second = await acceptSignal(db, s.actor, s.rates, reloaded);
    expect(second).toBe(first);
    const entries = await db.select().from(timeEntry);
    expect(entries).toHaveLength(1);
  });

  it("confirmed (approved) time does not lock the week: more can be confirmed", async () => {
    const s = await setup();
    const sig1 = await makeSignal(s, {
      chargeType: "project",
      projectId: s.proj.id,
      phaseId: s.ph.id,
      proposedHours: "4.00",
      externalId: "a",
    });
    await acceptSignal(db, s.actor, s.rates, sig1);
    const sig2 = await makeSignal(s, {
      chargeType: "project",
      projectId: s.proj.id,
      phaseId: s.ph.id,
      proposedHours: "2.00",
      externalId: "a2",
    });
    const second = await acceptSignal(db, s.actor, s.rates, sig2);
    expect(second).toBeTruthy();
    // Same charge + day folds into the one approved cell: 4 + 2.
    const [entry] = await db.select().from(timeEntry).where(eq(timeEntry.id, second!));
    expect(Number(entry.hours)).toBe(6);
    expect(entry.status).toBe("approved");
  });

  it("refuses to accept into a locked (submitted or invoiced) week", async () => {
    const s = await setup();
    const sig1 = await makeSignal(s, {
      chargeType: "project",
      projectId: s.proj.id,
      phaseId: s.ph.id,
      proposedHours: "4.00",
      externalId: "a",
    });
    const first = await acceptSignal(db, s.actor, s.rates, sig1);
    // A manual-grid submit locks the week (confirmed time stays approved, but
    // a submitted entry in the same week blocks further confirms).
    await db
      .update(timeEntry)
      .set({ status: "submitted" })
      .where(eq(timeEntry.id, first!));
    expect(await submitTimesheetWeek(db, s.actor, s.ent.id, s.res.id, "2026-07-27")).toBe(0);

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

// Daily notes (M5a): the draft engine already writes a plain-language evidence
// line for every block. Accepting a block must carry that onto the time entry
// so the narrative survives to the invoice, instead of being thrown away.
describe("acceptSignal notes", () => {
  it("carries the block's evidence onto the time entry as a note", async () => {
    const s = await setup();
    const sig = await makeSignal(s, {
      chargeType: "project",
      projectId: s.proj.id,
      phaseId: s.ph.id,
      proposedHours: "4.00",
      billable: true,
      evidence: "Design review with Acme",
    });

    const entryId = await acceptSignal(db, s.actor, s.rates, sig);
    const [entry] = await db
      .select()
      .from(timeEntry)
      .where(eq(timeEntry.id, entryId!));
    expect(entry.notes).toBe("Design review with Acme");
  });

  it("appends evidence when another block folds into the same day and charge", async () => {
    const s = await setup();
    const a = await makeSignal(s, {
      chargeType: "project",
      projectId: s.proj.id,
      phaseId: s.ph.id,
      proposedHours: "2.00",
      billable: true,
      evidence: "Design review",
    });
    const b = await makeSignal(s, {
      chargeType: "project",
      projectId: s.proj.id,
      phaseId: s.ph.id,
      proposedHours: "1.50",
      billable: true,
      evidence: "Prototype build",
    });

    const id1 = await acceptSignal(db, s.actor, s.rates, a);
    const id2 = await acceptSignal(db, s.actor, s.rates, b);
    expect(id2).toBe(id1); // folded into the same day + charge

    const [entry] = await db
      .select()
      .from(timeEntry)
      .where(eq(timeEntry.id, id1!));
    expect(Number(entry.hours)).toBe(3.5);
    expect(entry.notes).toBe("Design review\nPrototype build");
  });

  it("does not duplicate an identical evidence line when folding", async () => {
    const s = await setup();
    const a = await makeSignal(s, {
      chargeType: "project",
      projectId: s.proj.id,
      phaseId: s.ph.id,
      proposedHours: "2.00",
      billable: true,
      evidence: "Standup",
    });
    const b = await makeSignal(s, {
      chargeType: "project",
      projectId: s.proj.id,
      phaseId: s.ph.id,
      proposedHours: "1.00",
      billable: true,
      evidence: "Standup",
    });

    const id1 = await acceptSignal(db, s.actor, s.rates, a);
    await acceptSignal(db, s.actor, s.rates, b);

    const [entry] = await db
      .select()
      .from(timeEntry)
      .where(eq(timeEntry.id, id1!));
    expect(Number(entry.hours)).toBe(3);
    expect(entry.notes).toBe("Standup");
  });
});
