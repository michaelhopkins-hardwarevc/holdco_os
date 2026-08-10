// Adapter interface for the accounting system (CLAUDE.md: integrations behind
// adapter interfaces; the app never imports a vendor SDK outside its adapter).
// Xero is the MVP's only write target, and only DRAFT invoices a human approves.

export type DraftInvoiceLine = {
  description: string;
  quantity: number; // hours (T&M) or units (fixed-fee schedule)
  unitAmountCents: number; // per-unit price in integer cents
  trackingOption?: string | null; // the project's Xero tracking option
};

export type DraftInvoice = {
  reference: string; // the app invoice number
  clientName: string;
  date: string; // YYYY-MM-DD
  lines: DraftInvoiceLine[];
};

export type DraftInvoiceResult = { externalId: string; status: string };

export interface AccountingProvider {
  readonly name: string;
  /** Create a DRAFT invoice; returns the external id + status. */
  createDraftInvoice(invoice: DraftInvoice): Promise<DraftInvoiceResult>;
}

/**
 * The draft's total in integer cents, computed the same way the app stores line
 * amounts (round each line's quantity x unit price). Used to prove the pushed
 * invoice reconciles to the app invoice before it leaves the building.
 */
export function reconcileDraftCents(invoice: DraftInvoice): number {
  return invoice.lines.reduce(
    (sum, l) => sum + Math.round(l.quantity * l.unitAmountCents),
    0,
  );
}
