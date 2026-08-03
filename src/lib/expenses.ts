// Expense helpers.

export const EXPENSE_CATEGORIES = [
  "travel",
  "meals",
  "lodging",
  "supplies",
  "mileage",
  "software",
  "shipping",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/**
 * The value an expense bills to the client: cost plus optional markup, in cents.
 * Non-billable expenses never reach here (they're filtered out of invoicing).
 */
export function expenseBillableValue(
  amountCents: number,
  markupPct: number | string | null | undefined,
): number {
  const pct =
    markupPct === null || markupPct === undefined ? 0 : Number(markupPct);
  const m = Number.isFinite(pct) ? pct : 0;
  return Math.round(amountCents * (1 + m / 100));
}
