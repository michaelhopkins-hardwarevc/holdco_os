// Pure CSV import helpers: parsing, workbook header detection, and value
// mapping. No DB access here so parsing + validation rules are unit-testable.
// The interim workbook tabs carry two title rows above the real header row, so
// we locate the header by matching known column labels rather than assuming
// row 1.
import { dollarsToCents } from "@/lib/money";

/** Parse CSV text (RFC-4180: quoted fields, doubled quotes, CR/LF/CRLF). */
export function parseCsv(input: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let started = false; // did the current row have any content/field?
  const endField = () => {
    row.push(field);
    field = "";
    started = true;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    started = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      started = true;
    } else if (ch === ",") {
      endField();
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      endRow();
    } else if (ch === "\n") {
      endRow();
    } else {
      field += ch;
      started = true;
    }
  }
  if (started || field.length > 0) endRow();
  return rows;
}

/** True if every cell in the row is blank. */
export function isBlankRow(cells: string[]): boolean {
  return cells.every((c) => c.trim() === "");
}

/**
 * Normalize a header label to a comparable token string. `$`, `%`, `#` are kept
 * as words so "Billable?" and "Billable $" don't collide.
 */
export function normalizeHeader(s: string): string {
  return s
    .toLowerCase()
    .replace(/\$/g, " usd ")
    .replace(/%/g, " pct ")
    .replace(/#/g, " num ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// A field's accepted (already-normalized) header variants.
export type FieldMap = Record<string, string[]>;

export type HeaderLocation = {
  headerRow: number; // index into parsed rows
  index: Record<string, number>; // field -> column index
};

/**
 * Find the header row and map each requested field to its column index by
 * matching known label variants. Returns null if no row satisfies `required`.
 */
export function locateHeader(
  rows: string[][],
  fields: FieldMap,
  required: string[],
): HeaderLocation | null {
  for (let r = 0; r < rows.length; r++) {
    const norm = rows[r].map(normalizeHeader);
    const index: Record<string, number> = {};
    for (const [field, variants] of Object.entries(fields)) {
      const col = norm.findIndex((h) => h !== "" && variants.includes(h));
      if (col !== -1) index[field] = col;
    }
    if (required.every((f) => f in index)) return { headerRow: r, index };
  }
  return null;
}

/** Read a field from a row using the located column map; "" if absent. */
export function cell(
  cells: string[],
  index: Record<string, number>,
  field: string,
): string {
  const i = index[field];
  if (i === undefined) return "";
  return (cells[i] ?? "").trim();
}

// --- Value mappers ----------------------------------------------------------

/** Yes/No/true/1 -> boolean. Blank -> false. */
export function parseYesNo(s: string): boolean {
  const v = s.trim().toLowerCase();
  return v === "yes" || v === "y" || v === "true" || v === "1";
}

/** Dollars string -> integer cents, or null if blank/invalid. */
export function moneyToCents(s: string): number | null {
  return dollarsToCents(s);
}

/** Parse an hours value (>= 0). null if blank/invalid/negative. */
export function parseHours(s: string): number | null {
  const v = s.trim();
  if (v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * Target utilization -> percent string (e.g. "75.00"). The workbook stores a
 * fraction (0.75); a value <= 1 is treated as a fraction, otherwise as a
 * percent already. null if blank/invalid.
 */
export function parseTargetUtil(s: string): string | null {
  const v = s.trim().replace("%", "");
  if (v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  const pct = n <= 1 ? n * 100 : n;
  return pct.toFixed(2);
}

const PROJECT_TYPES: Record<string, string> = {
  "time materials": "time_materials",
  "time and materials": "time_materials",
  "t m": "time_materials",
  tm: "time_materials",
  "fixed fee": "fixed_fee",
  fixed: "fixed_fee",
  "cost plus": "cost_plus",
  "not to exceed": "not_to_exceed",
  nte: "not_to_exceed",
  internal: "internal",
};
export function mapProjectType(s: string): string | null {
  return PROJECT_TYPES[normalizeHeader(s)] ?? null;
}

const PROJECT_STATUS: Record<string, string> = {
  prospect: "prospect",
  active: "active",
  "on hold": "on_hold",
  hold: "on_hold",
  closed: "closed",
  complete: "closed",
  completed: "closed",
};
export function mapProjectStatus(s: string): string {
  return PROJECT_STATUS[normalizeHeader(s)] ?? "active";
}

const INDIRECT_CATEGORY: Record<string, string> = {
  overhead: "overhead",
  pto: "pto",
  "paid time off": "pto",
  holiday: "holiday",
  sick: "sick",
  "business dev": "business_dev",
  "business development": "business_dev",
  bd: "business_dev",
  training: "training",
  admin: "admin",
  administration: "admin",
  rnd: "rnd",
  "r d": "rnd",
  "research development": "rnd",
};
export function mapIndirectCategory(s: string): string | null {
  return INDIRECT_CATEGORY[normalizeHeader(s)] ?? null;
}

/** "Project"/"Indirect" -> chargeType. null if unrecognized. */
export function mapChargeType(s: string): "project" | "indirect" | null {
  const v = normalizeHeader(s);
  if (v === "project" || v === "billable" || v === "client") return "project";
  if (v === "indirect" || v === "overhead" || v === "non billable") return "indirect";
  return null;
}

/** "Active"/"Inactive" -> status string. Defaults to active. */
export function mapActiveStatus(s: string): string {
  const v = normalizeHeader(s);
  if (v === "inactive" || v === "terminated" || v === "closed") return "inactive";
  return "active";
}

/** Accept common date spellings; return YYYY-MM-DD or null. */
export function parseDate(s: string): string | null {
  const v = s.trim();
  if (v === "") return null;
  // ISO already.
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  // M/D/YYYY or MM/DD/YYYY.
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, mo, d, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

// --- Validation report ------------------------------------------------------

export type RowError = { row: number; message: string };
export type ImportSummary = {
  type: string;
  imported: number;
  updated: number;
  skipped: number;
  errors: RowError[];
};

export function emptySummary(type: string): ImportSummary {
  return { type, imported: 0, updated: 0, skipped: 0, errors: [] };
}
