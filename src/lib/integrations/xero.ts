import type {
  AccountingProvider,
  DraftInvoice,
  DraftInvoiceResult,
} from "./accounting";

// Xero accounting provider. Writes DRAFT accounts-receivable invoices via the
// Xero API (OAuth 2.0 bearer token + tenant id). Draft only — a human approves
// and sends in Xero. Read-only elsewhere in the MVP.

// The tracking category (in Xero) whose options are our projects. Configurable
// via env; defaults to "Project".
const TRACKING_CATEGORY = process.env.XERO_TRACKING_CATEGORY || "Project";

type XeroLineItem = {
  Description: string;
  Quantity: number;
  UnitAmount: number; // dollars (Xero uses decimal currency)
  Tracking?: { Name: string; Option: string }[];
};
type XeroInvoicePayload = {
  Type: "ACCREC";
  Status: "DRAFT";
  Contact: { Name: string };
  Date: string;
  Reference: string;
  LineAmountTypes: "Exclusive";
  LineItems: XeroLineItem[];
};

/** Build the Xero invoice payload from our normalized draft (pure). Cents are
 *  converted to decimal dollars; tracking is attached per line when present. */
export function buildXeroPayload(invoice: DraftInvoice): XeroInvoicePayload {
  return {
    Type: "ACCREC",
    Status: "DRAFT",
    Contact: { Name: invoice.clientName },
    Date: invoice.date,
    Reference: invoice.reference,
    LineAmountTypes: "Exclusive",
    LineItems: invoice.lines.map((l) => ({
      Description: l.description,
      Quantity: l.quantity,
      UnitAmount: l.unitAmountCents / 100,
      ...(l.trackingOption
        ? { Tracking: [{ Name: TRACKING_CATEGORY, Option: l.trackingOption }] }
        : {}),
    })),
  };
}

export function xeroProvider(
  accessToken: string,
  tenantId: string,
): AccountingProvider {
  return {
    name: "xero",
    async createDraftInvoice(invoice): Promise<DraftInvoiceResult> {
      const res = await fetch("https://api.xero.com/api.xro/2.0/Invoices", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Xero-tenant-id": tenantId,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ Invoices: [buildXeroPayload(invoice)] }),
      });
      if (!res.ok) {
        throw new Error(
          `Xero invoice create failed (${res.status}): ${await res.text()}`,
        );
      }
      const json = (await res.json()) as {
        Invoices?: { InvoiceID?: string; Status?: string }[];
      };
      const created = json.Invoices?.[0];
      if (!created?.InvoiceID) {
        throw new Error("Xero returned no InvoiceID.");
      }
      return {
        externalId: created.InvoiceID,
        status: created.Status ?? "DRAFT",
      };
    },
  };
}
