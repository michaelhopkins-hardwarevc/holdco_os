// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  crosswalkProject,
  entity,
  invoice,
  invoiceLine,
  user,
} from "@/db/schema";
import { seed } from "@/db/seed";
import { createTestDb, type TestDb } from "@/db/test-helpers";
import {
  type AccountingProvider,
  reconcileDraftCents,
} from "@/lib/integrations/accounting";
import {
  exportInvoiceToXero,
  InvoiceReconciliationError,
} from "@/lib/xero-export-db";

let pg: TestDb["pg"];
let db: TestDb["db"];

beforeEach(async () => {
  ({ pg, db } = await createTestDb());
});
afterEach(async () => {
  await pg.close();
});

async function setupInvoice(subtotal = 75000) {
  await seed(db);
  const [ent] = await db.select().from(entity);
  const [u] = await db.select().from(user);
  const [xw] = await db
    .select()
    .from(crosswalkProject)
    .where(eq(crosswalkProject.entityId, ent.id));
  const scope = { organizationId: ent.organizationId, entityId: ent.id };

  const [inv] = await db
    .insert(invoice)
    .values({
      ...scope,
      clientId: xw.clientId,
      projectId: xw.projectId,
      number: "INV-1001",
      invoiceDate: "2026-07-31",
      periodStart: "2026-07-27",
      periodEnd: "2026-07-31",
      status: "draft",
      subtotal,
      total: subtotal,
    })
    .returning();

  await db.insert(invoiceLine).values([
    {
      ...scope,
      invoiceId: inv.id,
      source: "time",
      description: "Design",
      quantity: "2.00",
      rate: 22500,
      amount: 45000,
      sortOrder: 1,
    },
    {
      ...scope,
      invoiceId: inv.id,
      source: "time",
      description: "Engineering",
      quantity: "1.50",
      rate: 20000,
      amount: 30000,
      sortOrder: 2,
    },
  ]);

  return { ent, inv, xw, actor: { orgId: ent.organizationId, actorId: u.id } };
}

function fakeProvider() {
  const calls: Parameters<AccountingProvider["createDraftInvoice"]>[0][] = [];
  const provider: AccountingProvider = {
    name: "fake",
    async createDraftInvoice(d) {
      calls.push(d);
      return { externalId: "XERO-INV-1", status: "DRAFT" };
    },
  };
  return { provider, calls };
}

describe("exportInvoiceToXero", () => {
  it("pushes a reconciled draft, applies tracking, and records the Xero id", async () => {
    const { ent, inv, xw, actor } = await setupInvoice();
    const { provider, calls } = fakeProvider();

    const result = await exportInvoiceToXero(
      db,
      actor,
      provider,
      ent.id,
      inv.id,
    );

    expect(result).toEqual({ externalId: "XERO-INV-1", status: "DRAFT" });
    expect(calls).toHaveLength(1);
    // The pushed draft reconciles to the app invoice subtotal.
    expect(reconcileDraftCents(calls[0])).toBe(75000);
    expect(calls[0].reference).toBe("INV-1001");
    expect(calls[0].lines).toHaveLength(2);
    expect(calls[0].lines[0].trackingOption).toBe(xw.xeroTrackingOption);

    const [after] = await db
      .select()
      .from(invoice)
      .where(eq(invoice.id, inv.id));
    expect(after.xeroInvoiceId).toBe("XERO-INV-1");
    expect(after.xeroStatus).toBe("DRAFT");

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.recordId, inv.id));
    expect(audits.some((a) => a.action === "xero_export")).toBe(true);
  });

  it("is idempotent — a second push returns the existing id without re-sending", async () => {
    const { ent, inv, actor } = await setupInvoice();
    const { provider, calls } = fakeProvider();
    await exportInvoiceToXero(db, actor, provider, ent.id, inv.id);
    const again = await exportInvoiceToXero(
      db,
      actor,
      provider,
      ent.id,
      inv.id,
    );
    expect(again.externalId).toBe("XERO-INV-1");
    expect(calls).toHaveLength(1); // not pushed twice
  });

  it("aborts (does not push) when the invoice does not reconcile", async () => {
    // Subtotal deliberately wrong vs the lines (which total 75000).
    const { ent, inv, actor } = await setupInvoice(99999);
    const { provider, calls } = fakeProvider();

    await expect(
      exportInvoiceToXero(db, actor, provider, ent.id, inv.id),
    ).rejects.toBeInstanceOf(InvoiceReconciliationError);
    expect(calls).toHaveLength(0);

    const [after] = await db
      .select()
      .from(invoice)
      .where(eq(invoice.id, inv.id));
    expect(after.xeroInvoiceId).toBeNull();
  });
});
