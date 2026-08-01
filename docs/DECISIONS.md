# Engineering decisions

Short notes on non-obvious choices. Newest first.

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
