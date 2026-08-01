import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Single shared Postgres connection to Supabase. In development the module can
// be re-evaluated on hot reload, so the client is cached on globalThis to avoid
// opening a new pool on every change.
const globalForDb = globalThis as unknown as {
  client: ReturnType<typeof postgres> | undefined;
};

function getClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in (see README).",
    );
  }
  const client = globalForDb.client ?? postgres(url, { prepare: false });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.client = client;
  }
  return client;
}

// Lazy proxy: nothing connects until the db is actually used, so importing this
// module (e.g. in tests or at build time) never requires a live database.
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, prop) {
    const instance = createDb();
    return instance[prop as keyof typeof instance];
  },
});

function createDb() {
  return drizzle(getClient(), { schema });
}
