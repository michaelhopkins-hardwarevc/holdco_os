// Money is stored as integer cents everywhere (CLAUDE.md). These helpers
// convert between the dollars users type/see and the cents we persist. Round
// only here, at the boundary.

/** Parse a dollars string/number to integer cents. Empty -> null. */
export function dollarsToCents(
  input: string | number | null | undefined,
): number | null {
  if (input === null || input === undefined) return null;
  const raw = typeof input === "number" ? String(input) : input;
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** Like dollarsToCents but returns 0 (not null) for empty/invalid input. */
export function dollarsToCentsOrZero(
  input: string | number | null | undefined,
): number {
  return dollarsToCents(input) ?? 0;
}

/** Cents -> a plain "1234.56" string suitable for a number input's value. */
export function centsToDollars(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}

/** Cents -> a display string like "$1,234.56" (or "—" when null). */
export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
