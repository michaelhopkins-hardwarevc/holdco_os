import { type SQL, sql } from "drizzle-orm";
import { db } from "./index";

// Minimal shape shared by drizzle transactions across drivers (postgres-js and
// PGlite), so the same context-setting logic runs in the app and in tests.
type Executor = { execute: (query: SQL) => Promise<unknown> };

/**
 * Put the current transaction into "authenticated user" mode: switch to the
 * `authenticated` role and set the JWT `sub` claim so Supabase's `auth.uid()`
 * resolves to this user. After this, RLS policies apply to every query on `tx`.
 *
 * `authUserId` is the Supabase Auth user id (what `auth.uid()` returns).
 */
export async function applyUserContext(
  tx: Executor,
  authUserId: string,
): Promise<void> {
  await tx.execute(
    sql`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: authUserId,
      role: "authenticated",
    })}, true)`,
  );
  await tx.execute(sql`set local role authenticated`);
}

/**
 * Run a callback as the given authenticated user, with row-level security in
 * force. Any query run on the provided transaction sees only rows the RLS
 * policies allow.
 */
export async function runWithUser<T>(
  authUserId: string,
  fn: (tx: Parameters<Parameters<(typeof db)["transaction"]>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await applyUserContext(tx, authUserId);
    return fn(tx);
  });
}
