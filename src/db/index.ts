import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Client = ReturnType<typeof postgres>;
type Database = ReturnType<typeof drizzle<typeof schema>>;

// Cache the Postgres client and drizzle instance on globalThis so they are
// created exactly once and reused across hot reloads (dev) and warm serverless
// invocations (production). Creating a new pool per use would exhaust Supabase's
// connection pooler.
const globalForDb = globalThis as unknown as {
  __holdcoClient?: Client;
  __holdcoDb?: Database;
};

function getDb(): Database {
  if (globalForDb.__holdcoDb) return globalForDb.__holdcoDb;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in (see README).",
    );
  }

  // `prepare: false` is required for Supabase's transaction pooler (pgbouncer).
  const client = globalForDb.__holdcoClient ?? postgres(url, { prepare: false });
  globalForDb.__holdcoClient = client;

  const database = drizzle(client, { schema });
  globalForDb.__holdcoDb = database;
  return database;
}

// Lazy, memoized proxy: nothing connects until the db is first used (so importing
// this module at build time or in tests never requires a live database), but
// once created the same instance is reused and methods are bound to it.
export const db = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const database = getDb();
    const value = Reflect.get(database, prop, receiver);
    return typeof value === "function" ? value.bind(database) : value;
  },
});
