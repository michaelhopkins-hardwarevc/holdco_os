import { NextResponse } from "next/server";
import { db } from "@/db";
import { runWithUser } from "@/db/rls";
import { entity, organization } from "@/db/schema";

// TEMPORARY diagnostic endpoint — remove after debugging. Surfaces the real
// error from the database layer in the Vercel runtime.
export async function GET() {
  // Safe shape report of the connection strings (never the secret value).
  function shape(v: string | undefined) {
    if (!v) return { present: false };
    return {
      present: true,
      length: v.length,
      startsWithPostgres: v.startsWith("postgres"),
      hasQuotes: /["']/.test(v),
      hasWhitespace: /\s/.test(v),
      hasBracket: v.includes("["),
      firstChars: v.slice(0, 13),
    };
  }

  const results: Record<string, unknown> = {
    nodeEnv: process.env.NODE_ENV,
    databaseUrlShape: shape(process.env.DATABASE_URL),
    directUrlShape: shape(process.env.DIRECT_URL),
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
