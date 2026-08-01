import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/**
 * A fresh in-process Postgres with the Supabase prerequisites our migrations
 * rely on (the `anon`/`authenticated`/`service_role` roles and an `auth.uid()`
 * that reads the JWT claim), then all migrations applied. Used to prove the
 * schema, seed, and RLS policies behave against a real Postgres engine.
 */
export async function createTestDb() {
  const pg = new PGlite();
  await pg.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
    $$;
  `);
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  return { pg, db };
}
