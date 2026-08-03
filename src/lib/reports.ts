// Pure reporting math + CSV serialization. No DB access here so the ratio rules
// (and their divide-by-zero guards, per CLAUDE.md) are unit-testable in
// isolation. Money is cents; hours are decimal numbers.

/** Round to 2 decimals. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Margin as a percent of billable value: (billable - cost) / billable * 100.
 * Returns null when there is no billable value to divide by.
 */
export function marginPct(
  billableCents: number,
  costCents: number,
): number | null {
  if (billableCents <= 0) return null;
  return round2(((billableCents - costCents) / billableCents) * 100);
}

/**
 * Percent of the contract fee consumed by billable value to date.
 * Returns null for projects without a fixed fee (T&M, or no contract value).
 */
export function pctFeeUsed(
  billableCents: number,
  feeCents: number | null | undefined,
): number | null {
  if (!feeCents || feeCents <= 0) return null;
  return round2((billableCents / feeCents) * 100);
}

/**
 * Utilization: billable hours as a percent of total hours logged.
 * Returns null when no hours were logged in the period.
 */
export function utilizationPct(
  billableHours: number,
  totalHours: number,
): number | null {
  if (totalHours <= 0) return null;
  return round2((billableHours / totalHours) * 100);
}

/**
 * Serialize rows to RFC-4180 CSV. Fields containing a comma, quote, or newline
 * are wrapped in double quotes with embedded quotes doubled. null/undefined
 * render as empty. Lines are joined with CRLF for maximum spreadsheet
 * compatibility.
 */
export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
): string {
  const esc = (v: string | number | null | undefined): string => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const line = (cells: Array<string | number | null | undefined>) =>
    cells.map(esc).join(",");
  return [line(headers), ...rows.map(line)].join("\r\n");
}

/** Cents -> a plain "1234.56" string for CSV money columns (no $ or commas). */
export function csvDollars(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}
