// CSV shaping for each report. Pure: takes already-fetched report data and
// returns a CSV string. Money columns render as plain dollars (no $/commas).
import type {
  FirmDashboard,
  ProjectProfit,
  ResourceUtilization,
} from "@/lib/reports-db";
import { csvDollars, toCsv } from "@/lib/reports";

export function profitabilityCsv(projects: ProjectProfit[]): string {
  const headers = [
    "Level",
    "Code",
    "Name",
    "Type",
    "Budget Hours",
    "Actual Hours",
    "Budget $",
    "Billable Value",
    "Cost",
    "Margin",
    "Margin %",
    "% Fee Used",
    "WIP",
  ];
  const rows: Array<Array<string | number | null>> = [];
  for (const p of projects) {
    rows.push([
      "Project",
      p.code,
      p.name,
      p.type,
      p.budgetHours,
      p.actualHours,
      csvDollars(p.contractValue),
      csvDollars(p.billableValue),
      csvDollars(p.cost),
      csvDollars(p.margin),
      p.marginPct,
      p.pctFeeUsed,
      csvDollars(p.wip),
    ]);
    for (const ph of p.phases) {
      rows.push([
        "Phase",
        "",
        ph.phaseName,
        "",
        ph.budgetHours,
        ph.actualHours,
        csvDollars(ph.budgetAmount),
        csvDollars(ph.billableValue),
        csvDollars(ph.cost),
        csvDollars(ph.margin),
        "",
        "",
        csvDollars(ph.wip),
      ]);
    }
  }
  return toCsv(headers, rows);
}

export function utilizationCsv(rows: ResourceUtilization[]): string {
  const headers = [
    "Resource",
    "Title",
    "Billable Hours",
    "Total Hours",
    "Utilization %",
    "Target %",
  ];
  return toCsv(
    headers,
    rows.map((r) => [
      r.name,
      r.title,
      r.billableHours,
      r.totalHours,
      r.utilizationPct,
      r.targetPct,
    ]),
  );
}

export function dashboardCsv(d: FirmDashboard): string {
  const headers = ["Metric", "Value"];
  const rows: Array<Array<string | number | null>> = [
    ["From", d.from ?? "all time"],
    ["To", d.to ?? "today"],
    ["Billable $", csvDollars(d.billable)],
    ["Cost $", csvDollars(d.cost)],
    ["Margin $", csvDollars(d.margin)],
    ["Margin %", d.marginPct],
    ["Billable hours", d.billableHours],
    ["Total hours", d.totalHours],
    ["Utilization %", d.utilizationPct],
    ["WIP $ (time + expense)", csvDollars(d.wip)],
    ["AR outstanding $", csvDollars(d.arOutstanding)],
  ];
  return toCsv(headers, rows);
}
