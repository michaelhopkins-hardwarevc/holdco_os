import { type NextRequest } from "next/server";
import { runWithUser } from "@/db/rls";
import { utilizationCsv } from "@/lib/report-csv";
import { csvResponse, resolveReportRequest } from "@/lib/report-request";
import { utilizationByResource } from "@/lib/reports-db";

export async function GET(request: NextRequest) {
  const r = await resolveReportRequest(request);
  if (!r.ok) return r.response;
  const rows = await runWithUser(r.authUserId, (tx) =>
    utilizationByResource(tx, r.entityId, r.range),
  );
  return csvResponse(utilizationCsv(rows), "utilization.csv");
}
