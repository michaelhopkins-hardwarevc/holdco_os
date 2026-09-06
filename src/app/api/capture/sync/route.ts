import { NextResponse, type NextRequest } from "next/server";
import { syncAllEntities } from "@/lib/capture-service";

// Daily capture pull, triggered by Vercel Cron (see vercel.json). Vercel sends
// `Authorization: Bearer <CRON_SECRET>` when the CRON_SECRET env var is set, so
// we gate on that. Never enable without CRON_SECRET (the guard denies all).
// Syncs every live entity; one entity's failure is reported, not fatal.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncAllEntities();
    const failed = result.entities.filter((e) => e.error).length;
    return NextResponse.json({ ok: failed === 0, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
