// The client-facing project line on a Xero invoice.
//
// Xero's invoice templates cannot print a tracking category, so the project
// tag we attach to each line (see integrations/xero.ts) is invisible to the
// client. What templates DO print is the invoice Reference. So the Reference
// carries the project: code, client, project name, period. It matches the
// convention on the invoices Brooks Stevens has already issued by hand, e.g.
//
//   P-6025 MicroLumix - 2026 Fractional ID Support - Sep 21-25 2026
//
// Pure, so the exact string is testable without a database or Xero.

/** Xero rejects a Reference longer than this. */
const MAX_REFERENCE = 255;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

type Ymd = { y: number; m: number; d: number };

/** Parse YYYY-MM-DD as written. `new Date("2026-01-01")` is UTC midnight, which
 *  is the previous day in Milwaukee, and an invoice period must not drift. */
function parseDate(iso: string | null): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso ?? "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

const day = (x: Ymd) => `${MONTHS[x.m - 1]} ${x.d}`;
const dayYear = (x: Ymd) => `${day(x)} ${x.y}`;
const asNumber = (x: Ymd) => x.y * 10000 + x.m * 100 + x.d;

/**
 * A period as a human reads it: "Oct 5-9 2026", "Sep 28-Oct 2 2026",
 * "Dec 28 2026-Jan 1 2027", or a single "Oct 9 2026". Either end may be
 * missing; a backwards range is treated as the one date we trust.
 */
export function formatPeriod(
  startISO: string | null,
  endISO: string | null,
): string {
  const a = parseDate(startISO);
  const b = parseDate(endISO);
  if (!a && !b) return "";
  if (!a) return dayYear(b!);
  if (!b) return dayYear(a);
  if (asNumber(b) < asNumber(a)) return dayYear(a);
  if (asNumber(a) === asNumber(b)) return dayYear(a);
  if (a.y !== b.y) return `${dayYear(a)}-${dayYear(b)}`;
  if (a.m !== b.m) return `${day(a)}-${day(b)} ${a.y}`;
  return `${day(a)}-${b.d} ${a.y}`;
}

export type ReferenceInput = {
  projectCode: string | null;
  projectName: string | null;
  clientName: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  /** Used for the period when the invoice has no period of its own. */
  invoiceDate: string | null;
};

/**
 * Build the Reference. Parts that are missing are dropped rather than printed
 * as gaps, and the client is not repeated when the project name already starts
 * with it (Ajera project names often do).
 */
export function buildInvoiceReference(input: ReferenceInput): string {
  const code = (input.projectCode ?? "").trim();
  const name = (input.projectName ?? "").trim();
  const client = (input.clientName ?? "").trim();
  const period =
    formatPeriod(input.periodStart, input.periodEnd) ||
    formatPeriod(input.invoiceDate, null);

  // Say nothing twice. Ajera project names often start with the client, and the
  // tracking options are written as "code + project description", so the code
  // string itself usually names both the project and the client.
  const codeLower = code.toLowerCase();
  const firstWordOfClient = client.split(/[\s,]+/)[0]?.toLowerCase() ?? "";
  const clientRepeated =
    client !== "" &&
    (name.toLowerCase().startsWith(client.toLowerCase()) ||
      codeLower.includes(client.toLowerCase()) ||
      (firstWordOfClient.length >= 4 && codeLower.includes(firstWordOfClient)));
  const nameRepeated = name !== "" && codeLower.includes(name.toLowerCase());
  const middle = [clientRepeated ? "" : client, nameRepeated ? "" : name]
    .filter(Boolean)
    .join(" - ");
  // The code runs straight into the middle ("P-6031 LeMans Corporation"), but
  // the period is always set off by a dash, middle or no middle.
  const front = [code, middle].filter(Boolean).join(" ");
  const full = [front, period].filter(Boolean).join(" - ");
  if (full.length <= MAX_REFERENCE) return full;

  // Over the limit: the code and the period are what a human scans for, so cut
  // the middle and keep the ends.
  const head = code ? `${code} ` : "";
  const end = period ? ` - ${period}` : "";
  const room = MAX_REFERENCE - head.length - end.length;
  if (room <= 0) return full.slice(0, MAX_REFERENCE);
  return `${head}${middle.slice(0, room).trimEnd()}${end}`;
}
