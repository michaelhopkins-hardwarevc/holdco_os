// Pure invoicing helpers (AR aging, invoice numbers).

export const AGING_BUCKETS = ["0-30", "31-60", "61-90", "90+"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export function daysBetween(fromISO: string, toISO: string): number {
  const ms = Date.parse(toISO) - Date.parse(fromISO);
  if (!Number.isFinite(ms)) return 0;
  return Math.floor(ms / 86_400_000);
}

/** Aging bucket for an invoice, by days since its (invoice) date. */
export function agingBucket(invoiceDateISO: string, asOfISO: string): AgingBucket {
  const d = daysBetween(invoiceDateISO, asOfISO);
  if (d <= 30) return "0-30";
  if (d <= 60) return "31-60";
  if (d <= 90) return "61-90";
  return "90+";
}

export function invoiceNumber(seq: number): string {
  return `INV-${String(seq).padStart(4, "0")}`;
}

export type GroupBy = "phase" | "resource";
