# HoldCo OS

Back-office operating system for a multi-entity holding company,
professional-services firm, product company, and venture studio.

- **What this is:** the operating layer that sits on top of regulated systems
  (QuickBooks, Carta, payroll). It is **not** the book of legal record.
- **Full requirements:** [`HoldCo_OS_Product_Spec.md`](./HoldCo_OS_Product_Spec.md)
- **Engineering guardrails (read before changing code):** [`CLAUDE.md`](./CLAUDE.md)
- **Build order:** one milestone at a time, Phase 1 first (spec §4, §7).

This repository is currently at the **scaffold** stage: the app, tooling, and
deploy pipeline are set up, but no features are built yet.

---

## Tech stack

| Layer      | Choice                                            |
| ---------- | ------------------------------------------------- |
| Language   | TypeScript (strict)                               |
| Framework  | Next.js 15 (App Router) + React 19                |
| UI         | Tailwind CSS v4 + shadcn/ui                        |
| Database   | PostgreSQL on Supabase, via Drizzle ORM           |
| Auth       | Supabase Auth (email + Google) — added in Phase 1 |
| Unit tests | Vitest + Testing Library                          |
| E2E tests  | Playwright                                         |
| Formatting | Prettier + ESLint                                 |
| Hosting    | Vercel (app) + Supabase (data)                    |

---

## For the non-technical owner: what you need to do

You do **not** need to write code. You need to create a few free accounts and
paste values into one file. Everything is numbered below. Do the sections in
order. If a step's "success looks like" doesn't match what you see, stop and
send me what you see.

### A. Create the free accounts (one-time)

1. Go to <https://github.com> and create an account (or sign in).
2. Go to <https://vercel.com/signup> and sign up **with your GitHub account**
   (click "Continue with GitHub").
3. Go to <https://supabase.com/dashboard/sign-up> and sign up (GitHub login is
   fine).

You can skip Resend and Sentry for now — they are only needed in later phases.

**Success looks like:** you can log in to github.com, vercel.com, and
supabase.com.

### B. Create the Supabase project and get its keys

1. In the Supabase dashboard, click **New project**.
2. Name it `holdco-os`. Choose a strong database password and **save it** in
   your password manager — you'll need it in a moment.
3. Pick the region closest to Milwaukee (e.g. **East US**). Click
   **Create new project** and wait ~2 minutes for it to finish provisioning.
4. In the left sidebar open **Project Settings → API**. Copy these two values:
   - **Project URL** → this is `NEXT_PUBLIC_SUPABASE_URL`
   - **Project API keys → `anon` `public`** → this is
     `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **Project API keys → `service_role` `secret`** (click "reveal") → this is
     `SUPABASE_SERVICE_ROLE_KEY`
5. In the left sidebar open **Project Settings → Database → Connection string**
   and choose the **URI** tab:
   - The **Transaction pooler** string (port `6543`) → `DATABASE_URL`
   - The **Direct connection** string (port `5432`) → `DIRECT_URL`
   - In both strings, replace `[YOUR-PASSWORD]` with the database password from
     step 2.

**Success looks like:** you have five values copied somewhere safe.

### C. Put the keys into the project

1. In the project folder, copy `.env.example` to a new file named `.env.local`.
2. Paste each value next to its key. Save the file.

`.env.local` is git-ignored, so these secrets never leave your machine.

**Success looks like:** `.env.local` exists with the Supabase values filled in.

### D. Get the code onto GitHub, then deploy on Vercel

The exact click-path for GitHub + Vercel is in the "Deploy" section I'll hand
you in chat (it depends on choices only you can make in the browser, like the
repository name). At a high level:

1. Create an empty GitHub repository named `holdco-os`.
2. Push this project to it (I give you the exact commands).
3. In Vercel, **Add New → Project**, import `holdco-os`, add the environment
   variables from `.env.local`, and click **Deploy**.

**Success looks like:** Vercel shows "Ready" and gives you a live URL that opens
the HoldCo OS placeholder page.

---

## For a developer: local commands

```bash
npm install            # install dependencies
cp .env.example .env.local   # then fill in values (see above)

npm run dev            # start the dev server at http://localhost:3000
npm run lint           # ESLint
npm run typecheck      # TypeScript, no emit
npm run format         # Prettier (write)
npm test               # Vitest unit tests
npm run e2e:install    # one-time: download the Playwright browser
npm run e2e            # Playwright end-to-end tests
npm run build          # production build
```

### Database (Drizzle)

Drizzle is configured against Supabase Postgres. No tables exist yet; they are
added in the schema milestone. All schema changes go through generated
migrations — never hand-edit the database.

```bash
npm run db:generate    # create a migration from the schema (no DB needed)
npm run db:migrate     # apply migrations to the database in DATABASE_URL
npm run db:seed        # load the sample design-firm data (safe: skips if present)
npm run db:studio      # browse data
```

The schema lives in `src/db/schema/` (core identity, Phase 1, and later-phase
scaffolding). Migrations are generated into `src/db/migrations/` and committed.
The schema and seed are verified by `npm test` against an in-process Postgres
(PGlite) — no database connection required to run the tests.

## Project layout

```
src/
  app/            # Next.js App Router (pages, layouts, API routes)
    api/health/   # liveness probe
  components/ui/  # shadcn/ui components
  db/             # Drizzle client + schema + migrations
  lib/            # utilities
e2e/              # Playwright specs
docs/DECISIONS.md # short notes on non-obvious choices
```

## Decisions

Non-obvious engineering choices are logged in
[`docs/DECISIONS.md`](./docs/DECISIONS.md).
