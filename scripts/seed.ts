import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { SAMPLE_ORG_SLUG, seed } from "../src/db/seed";

// Load .env.local first, then .env (dotenv does not override existing vars).
config({ path: ".env.local" });
config();

// Runnable seed against the real Supabase Postgres. Safe to run more than once:
// it skips if the sample organization already exists (no duplicate data, no
// hard deletes). Run migrations first (`npm run db:migrate`).
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in (see README).",
    );
  }

  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });

  try {
    const existing = await db
      .select({ id: schema.organization.id })
      .from(schema.organization)
      .where(eq(schema.organization.slug, SAMPLE_ORG_SLUG))
      .limit(1);

    if (existing.length > 0) {
      console.log(
        `Sample organization '${SAMPLE_ORG_SLUG}' already exists — skipping seed.`,
      );
      return;
    }

    const summary = await db.transaction((tx) => seed(tx));
    console.log("Seed complete:", summary);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
