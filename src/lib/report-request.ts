import { NextResponse, type NextRequest } from "next/server";
import { getContext, getEntityRole } from "@/lib/auth";
import type { DateRange } from "@/lib/reports-db";

// Shared gate for the CSV export routes: authenticate, require membership on the
// requested entity, and parse the date range. Any member may read reports.
export async function resolveReportRequest(
  request: NextRequest,
): Promise<
  | { ok: true; authUserId: string; entityId: string; range: DateRange }
  | { ok: false; response: NextResponse }
> {
  const ctx = await getContext();
  if (!ctx) {
    return { ok: false, response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  }
  const url = new URL(request.url);
  const entityId = url.searchParams.get("entityId");
  if (!entityId) {
    return { ok: false, response: NextResponse.json({ error: "entityId required" }, { status: 400 }) };
  }
  const role = await getEntityRole(ctx.appUser.id, entityId);
  if (!role) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return {
    ok: true,
    authUserId: ctx.authUser.id,
    entityId,
    range: { from: url.searchParams.get("from"), to: url.searchParams.get("to") },
  };
}

export function csvResponse(csv: string, filename: string): NextResponse {
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
