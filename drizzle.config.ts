import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Drizzle is configured for Supabase Postgres. Schema changes are made ONLY
// through generated migrations (see CLAUDE.md). No domain tables exist yet;
// they are added in the schema milestone (spec §6).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    // Migrations use the DIRECT connection (port 5432) when available; the
    // pooled URL works too. Only needed for db:migrate/push, not db:generate.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
