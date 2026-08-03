import { type NextRequest } from "next/server";
import { runWithUser } from "@/db/rls";
import { dashboardCsv } from "@/lib/report-csv";
import { csvResponse, resolveReportRequest } from "@/lib/report-request";
import { firmDashboard } from "@/lib/reports-db";

export async function GET(request: NextRequest) {
  const r = await resolveReportRequest(request);
  if (!r.ok) return r.response;
  const asOf = new Date().toISOString().slice(0, 10);
  const d = await runWithUser(r.authUserId, (tx) =>
    firmDashboard(tx, r.entityId, r.range, asOf),
  );
  return csvResponse(dashboardCsv(d), "firm-dashboard.csv");
}
