// CSV shaping for the list views (spec §7.7: everything exports to CSV). Each
// builder takes the rows from the matching queries.ts list function and returns
// a CSV string. Money renders as plain dollars. Export columns line up with the
// interim workbook so an export round-trips back through the importer.
import { csvDollars, toCsv } from "@/lib/reports";

type Row = Record<string, unknown>;

const s = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

export function clientsCsv(rows: Row[]): string {
  return toCsv(
    ["Name", "Status", "Billing Terms", "Address", "Notes"],
    rows.map((r) => [s(r.name), s(r.status), s(r.billingTerms), s(r.address), s(r.notes)]),
  );
}

export function projectsCsv(rows: Row[]): string {
  return toCsv(
    ["Project #", "Client", "Project Name", "Type", "Status", "Contract Fee ($)"],
    rows.map((r) => [
      s(r.code),
      s(r.clientName),
      s(r.name),
      s(r.type),
      s(r.status),
      csvDollars(r.contractValue as number | null),
    ]),
  );
}

export function resourcesCsv(rows: Row[]): string {
  return toCsv(
    ["Employee Name", "Role / Title", "Status", "Bill Rate ($/hr)", "Cost Rate ($/hr)", "Target Util %"],
    rows.map((r) => [
      s(r.name),
      s(r.title),
      s(r.status),
      csvDollars(r.billRate as number),
      csvDollars(r.costRate as number),
      s(r.targetUtilization),
    ]),
  );
}

export function indirectCodesCsv(rows: Row[]): string {
  return toCsv(
    ["Code", "Category", "Description", "Active"],
    rows.map((r) => [s(r.code), s(r.category), s(r.description), r.active ? "Yes" : "No"]),
  );
}

export function expensesCsv(rows: Row[]): string {
  return toCsv(
    ["Date", "Project", "Category", "Amount ($)", "Billable?", "Markup %", "Status"],
    rows.map((r) => [
      s(r.expenseDate),
      s(r.projectCode),
      s(r.category),
      csvDollars(r.amount as number),
      r.billable ? "Yes" : "No",
      s(r.markupPct),
      s(r.status),
    ]),
  );
}

export function invoicesCsv(rows: Row[]): string {
  return toCsv(
    ["Invoice #", "Client", "Project", "Date", "Status", "Total ($)", "Paid ($)", "Balance ($)"],
    rows.map((r) => {
      const total = (r.total as number) ?? 0;
      const paid = (r.amountPaid as number) ?? 0;
      return [
        s(r.number),
        s(r.clientName),
        s(r.projectCode),
        s(r.invoiceDate),
        s(r.status),
        csvDollars(total),
        csvDollars(paid),
        csvDollars(total - paid),
      ];
    }),
  );
}

export function timeEntriesCsv(rows: Row[]): string {
  return toCsv(
    [
      "Date",
      "Employee",
      "Charge Type",
      "Project / Code",
      "Phase",
      "Hours",
      "Billable?",
      "Bill Rate",
      "Billable $",
      "Cost $",
      "Status",
      "Notes",
    ],
    rows.map((r) => [
      s(r.workDate),
      s(r.resourceName),
      s(r.chargeType),
      s(r.projectCode ?? r.indirectCode),
      s(r.phaseName),
      s(r.hours),
      r.billable ? "Yes" : "No",
      csvDollars(r.billRate as number),
      csvDollars(r.billableAmount as number),
      csvDollars(r.costAmount as number),
      s(r.status),
      s(r.notes),
    ]),
  );
}
