import { NextResponse } from "next/server";
import { db } from "@/db";
import { runWithUser } from "@/db/rls";
import { entity, organization } from "@/db/schema";

// TEMPORARY diagnostic endpoint — remove after debugging. Surfaces the real
// error from the database layer in the Vercel runtime.
export async function GET() {
  const results: Record<string, unknown> = {
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    nodeEnv: process.env.NODE_ENV,
  };

  try {
    const orgs = await db.select().from(organization).limit(1);
    results.basicSelect = `ok (${orgs.length} rows)`;
  } catch (e) {
    results.basicSelect = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
    results.basicStack =
      e instanceof Error ? e.stack?.split("\n").slice(0, 6) : undefined;
    results.basicCause =
      e instanceof Error && e.cause instanceof Error ? e.cause.message : undefined;
  }

  try {
    const rows = await runWithUser(
      "00000000-0000-0000-0000-000000000000",
      (tx) => tx.select({ id: entity.id }).from(entity).limit(1),
    );
    results.runWithUser = `ok (${rows.length} rows)`;
  } catch (e) {
    results.runWithUser = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
    results.rwuStack =
      e instanceof Error ? e.stack?.split("\n").slice(0, 6) : undefined;
    results.rwuCause =
      e instanceof Error && e.cause instanceof Error ? e.cause.message : undefined;
  }

  return NextResponse.json(results);
}
