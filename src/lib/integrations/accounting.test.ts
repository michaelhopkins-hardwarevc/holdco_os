import { describe, expect, it } from "vitest";
import {
  type DraftInvoice,
  reconcileDraftCents,
} from "@/lib/integrations/accounting";
import { buildXeroPayload } from "@/lib/integrations/xero";

const draft: DraftInvoice = {
  reference: "INV-1001",
  clientName: "MicroLumix",
  date: "2026-07-31",
  lines: [
    {
      description: "Design",
      quantity: 2,
      unitAmountCents: 22500,
      trackingOption: "P-6041 GermPass",
    },
    { description: "Engineering", quantity: 1.5, unitAmountCents: 20000 },
  ],
};

describe("reconcileDraftCents", () => {
  it("sums rounded quantity x unit price in cents", () => {
    expect(reconcileDraftCents(draft)).toBe(45000 + 30000);
  });
});

describe("buildXeroPayload", () => {
  it("builds a DRAFT ACCREC invoice, cents -> dollars, with per-line tracking", () => {
    const p = buildXeroPayload(draft);
    expect(p).toMatchObject({
      Type: "ACCREC",
      Status: "DRAFT",
      Contact: { Name: "MicroLumix" },
      Reference: "INV-1001",
      LineAmountTypes: "Exclusive",
    });
    expect(p.LineItems[0]).toMatchObject({
      Description: "Design",
      Quantity: 2,
      UnitAmount: 225, // 22500 cents
    });
    expect(p.LineItems[0].Tracking).toEqual([
      { Name: "Project", Option: "P-6041 GermPass" },
    ]);
    // No tracking option -> no Tracking on the line.
    expect(p.LineItems[1].Tracking).toBeUndefined();
    // Xero's dollar line amount ties back to the app's cents.
    expect(
      Math.round(p.LineItems[0].Quantity * p.LineItems[0].UnitAmount * 100),
    ).toBe(45000);
  });
});
