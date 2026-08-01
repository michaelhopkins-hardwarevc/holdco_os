# Engineering decisions

Short notes on non-obvious choices. Newest first.

## 2026-08-01 — Database schema + seed (spec §6)

- **Tests run against PGlite, not Supabase.** `@electric-sql/pglite` is a real
  Postgres compiled to WASM that runs in-process. Tests apply the generated
  migration and load the seed against it, so "migrations apply cleanly and the
  seed loads" is proven with zero external setup and no secrets. The same seed
  function also runs against real Supabase via `npm run db:seed`.
- **RLS = enable, no policies (default-deny).** Every table gets
  `ENABLE ROW LEVEL SECURITY`. With no permissive policies, non-owner roles
  (Supabase's `anon` / `authenticated`) are denied by default — exactly the
  posture we want now. The membership-based *grant* policies come with auth in
  §7.1. The app/seed connect as the table owner, which bypasses RLS, so seeding
  works; the security boundary applies to the API roles.
- **`entity_id` on child tables too.** The spec lists `entity_id` on top-level
  tables; we also put `organization_id` + `entity_id` on child tables (contact,
  phase, invoice_line, payment, rate_override). It's a small denormalization
  that lets every RLS policy scope uniformly by entity without a join.
- **`audit_log` created now.** It isn't in the §6.1–6.4 lists, but CLAUDE.md
  requires an audit trail before any financial write, so the table is laid down
  with the schema to avoid a later migration. No rows are written until the
  features that mutate financial records exist.
- **Money is integer cents; hours/percent are `numeric`.** Rates are
  cents-per-hour. `numeric` columns (hours, budgets, utilization, markup) are
  exact decimals, never floats.
- **Enums via `pgEnum`** for the well-defined value sets (entity type, role,
  project/invoice/time statuses, indirect category, ...). Generic statuses
  (client/resource/entity/expense) are `text` with defaults to stay flexible.
- **Invoiced-immutability trigger deferred to §7.5.** CLAUDE.md says invoiced
  time is "protected from re-billing at the DB level." That protection only
  bites once invoicing exists, so the DB trigger lands with the invoicing
  milestone. The `time_entry.status` enum (incl. `invoiced`) and the
  exactly-one-charge / indirect-not-billable / phase-requires-project /
  hours-nonneg check constraints are in place now.
- **UUID v4 defaults** via `gen_random_uuid()` (core Postgres, supported by both
  Supabase and PGlite).

## 2026-08-01 — Scaffold

- **Next.js pinned to 15, not 16.** `create-next-app@latest` now installs
  Next.js 16, but the spec and `CLAUDE.md` fix the stack at Next.js 15
  ("do not substitute without explicit approval"). We scaffolded with
  `create-next-app@15` so the framework and all its config (ESLint, Tailwind)
  are internally consistent at version 15. Revisit only if the owner approves
  moving to 16.
- **React 19** as specified (19.1.0, the version Next 15.5 ships with).
- **Tailwind CSS v4** (the current default from `create-next-app@15`) with
  **shadcn/ui** on top. shadcn fully supports Tailwind v4; configuration lives
  in `src/app/globals.css` rather than a `tailwind.config.js`.
- **`next build` uses the stable (webpack) builder**, not `--turbopack`.
  Turbopack production builds are still beta in 15.5; the dev server still uses
  Turbopack (`next dev --turbopack`) for speed. Revisit once Turbopack build is
  stable.
- **Drizzle DB client is lazy** (`src/db/index.ts`). It only connects when first
  used, so importing it during tests or the build never requires a live
  `DATABASE_URL`. The Postgres client is cached on `globalThis` in development
  to survive hot reloads.
- **`postgres` driver with `{ prepare: false }`** because Supabase's transaction
  pooler (pgbouncer, port 6543) does not support prepared statements.
- **`.env.example` is committed** (via a `!.env.example` negation in
  `.gitignore`); all other `.env*` files stay ignored so real secrets are never
  committed.
- **Known audit advisories.** `npm audit` reports high-severity issues in
  `postcss` and `sharp` that are transitive dependencies **bundled inside
  Next.js 15.5.22 itself**. npm's suggested "fix" is to downgrade to next@9,
  which is wrong. These clear when Next ships a patch release; no action for the
  scaffold and they do not affect the placeholder deploy.
