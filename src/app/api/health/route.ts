import { NextResponse } from "next/server";

// Lightweight liveness probe (spec §9 "Observability: a health-check route").
// Intentionally does not touch the database so it stays green before Supabase
// is connected.
export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "holdco-os",
    time: new Date().toISOString(),
  });
}
