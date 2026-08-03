import { NextResponse, type NextRequest } from "next/server";
import { runWithUser } from "@/db/rls";
import { csvResponse, resolveReportRequest } from "@/lib/report-request";
import {
  clientsCsv,
  expensesCsv,
  indirectCodesCsv,
  invoicesCsv,
  projectsCsv,
  resourcesCsv,
  timeEntriesCsv,
} from "@/lib/list-csv";
import {
  listClients,
  listExpenses,
  listIndirectCodes,
  listInvoices,
  listProjects,
  listResources,
  listTimeEntries,
  type QueryDb,
} from "@/lib/queries";

// Each list export: the query to run and the CSV builder + filename.
const EXPORTS: Record<
  string,
  { file: string; run: (db: QueryDb, entityId: string) => Promise<unknown[]>; csv: (rows: never[]) => string }
> = {
  clients: { file: "clients.csv", run: (db, e) => listClients(db, e), csv: clientsCsv },
  projects: { file: "projects.csv", run: (db, e) => listProjects(db, e), csv: projectsCsv },
  resources: { file: "resources.csv", run: (db, e) => listResources(db, e), csv: resourcesCsv },
  "indirect-codes": { file: "indirect-codes.csv", run: (db, e) => listIndirectCodes(db, e), csv: indirectCodesCsv },
  expenses: { file: "expenses.csv", run: (db, e) => listExpenses(db, e), csv: expensesCsv },
  invoices: { file: "invoices.csv", run: (db, e) => listInvoices(db, e), csv: invoicesCsv },
  "time-entries": { file: "time-entries.csv", run: (db, e) => listTimeEntries(db, e), csv: timeEntriesCsv },
};

export async function GET(request: NextRequest) {
  const r = await resolveReportRequest(request);
  if (!r.ok) return r.response;
  const type = new URL(request.url).searchParams.get("type") ?? "";
  const spec = EXPORTS[type];
  if (!spec) {
    return NextResponse.json({ error: `Unknown export type "${type}"` }, { status: 400 });
  }
  const rows = await runWithUser(r.authUserId, (tx) => spec.run(tx, r.entityId));
  return csvResponse(spec.csv(rows as never[]), spec.file);
}
