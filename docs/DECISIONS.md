# Engineering decisions

Short notes on non-obvious choices. Newest first.

## 2026-08-01 — Fix: dashboard 500 after login (production)

Two bugs caused a server-side exception on the first authenticated page load in
production (they didn't surface in tests, which use PGlite directly, or in the
build):

- **DB client recreated per access in production.** `src/db/index.ts` only
  cached the Postgres client when `NODE_ENV !== "production"`, and its Proxy
  built a fresh drizzle instance (with unbound methods) on every property
  access. In production that opened a new pool per use and broke
  `db.transaction`'s `this`. Fixed: memoize the client *and* the drizzle
  instance on `globalThis` in all environments, and bind methods to the
  instance.
- **Concurrent first-sign-in insert race.** The `(app)` layout and the page both
  call `getContext()`, so on a brand-new user's first load two `ensureAppUser`
  inserts raced and one hit `user_email_unique` → 500. Fixed by wrapping
  `getContext` in React `cache()` (runs once per request) and making the user
  create an idempotent `onConflictDoUpdate` upsert by email.

Verified by reproducing the exact flow against a local production build with a
real Supabase login (dashboard now renders; create-entity → owner-scoped detail
works).

## 2026-08-01 — §7.1 Entities, users, roles

- **Auth via `@supabase/ssr`.** Cookie-based sessions for the App Router:
  browser client, server client, a service-role admin client (invites), and
  middleware that refreshes the session and redirects unauthenticated users to
  `/login`. Email/password and Google are both wired; Google also needs its
  provider configured in the Supabase + Google dashboards to function.
- **RLS is enforced on reads via a role switch, not the service role.** The app
  connects as `postgres` (which bypasses RLS). To actually enforce policies,
  `runWithUser()` opens a transaction, runs `set local role authenticated` and
  sets `request.jwt.claims.sub`, so `auth.uid()` resolves and every read on that
  transaction is filtered by the SELECT policies. Verified against real Supabase.
- **Two identity ids.** Supabase Auth users (`auth.users.id`, what `auth.uid()`
  returns) are distinct from our `public.user.id`. `public.user.auth_id` links
  them; the `app_current_user_id()` SECURITY DEFINER function maps one to the
  other so policies read naturally.
- **Writes go through the service role behind authorized server actions.**
  Config actions (create/edit entity, invite, change role) check the caller's
  role with `assertEntityRole()` (spec §9: authorize every action by role) then
  write via the service-role connection. Read *scoping/isolation* is enforced by
  RLS (the tested AC); write *authorization* is enforced in the action layer.
- **Bootstrap: any signed-in user can create an entity** and becomes its owner
  (there is no entity to be an admin of yet). Within an entity, only owner/admin
  can invite or change roles. Open email/password sign-up is enabled for the
  same bootstrap reason; a production build would restrict sign-up to invites.
- **Invites are membership-first.** `inviteMember` always records the
  `membership` (so the role assignment is immediately visible) and sends the
  Supabase email invite best-effort. When the invitee later signs in with that
  email, `ensureAppUser` links their auth account to the existing membership.
- **RLS tests emulate Supabase locally.** `createTestDb()` creates the
  `anon`/`authenticated`/`service_role` roles and an `auth.uid()` that reads the
  JWT claim, then applies the same migrations, so the policy behaviour is proven
  against a real Postgres engine (PGlite) with no Supabase connection.

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

## §7.5 Invoicing, WIP & AR

- **Reconciliation is the anchor.** `invoicing-db.test.ts` proves invoice total
  == sum(lines) == sum(invoiced time billable_amount) + sum(billable expense
  values), that WIP drops to 0 when everything is invoiced and returns on void,
  and that AR aging + payments tie out. This is the "numbers tie out" test the
  spec requires.
- **Double-billing is blocked two ways.** (1) `generateDraftInvoice` only pulls
  time with `status='approved'` and `invoice_id IS NULL`, then flips it to
  `invoiced` + links the invoice id; the same records can never be pulled twice.
  (2) A DB trigger (`guard_invoiced_time_entry`, migration 0008) rejects any
  UPDATE that changes billing fields on an already-`invoiced` row. Voiding is
  still allowed because it sets status back to `approved` first.
- **Time/expense lines are derived, not editable.** Only `manual`/`fixed` lines
  can be edited or removed on a draft. To change billed time you void the
  invoice (which releases the records back to WIP) and regenerate. This keeps
  the invoice reconcilable to its underlying records at all times.
- **pdf-lib for the branded PDF.** Chosen over a headless-browser renderer
  (Puppeteer/Playwright) because it is pure JS with no native binaries, so it
  runs unchanged on Vercel's serverless runtime and needs no extra buildpack.
  PDFs are stored in a private `invoices` Storage bucket and served via
  short-lived signed URLs (same pattern as receipts).
- **WIP/AR computed on read, not stored.** No denormalized balances to drift;
  both are pure aggregates over the underlying records, matching the
  reconciliation test.

## §7.6 Reporting & dashboards

- **Reconciliation is the anchor (again).** `reports-db.test.ts` proves the firm
  dashboard's billable/cost/hours equal raw sums straight from `time_entry`,
  that per-phase profitability sums to the project total, that per-resource
  utilization hours sum to the firm totals, and that the sum of per-project WIP
  equals the labor leg of `computeWip` before and after invoicing. AR ties to
  `computeArAging`.
- **Actuals = all logged time (any status).** Profitability and utilization
  count every non-deleted time entry (draft through invoiced) so the numbers
  reflect real logged work. WIP is the narrower "approved, billable, not yet
  invoiced" slice, matching §7.5.
- **Profitability is labor-based.** Billable value, cost, and margin come from
  time only; expenses are pass-through (billed at cost + markup) and are not
  margin drivers. The firm-dashboard WIP figure still includes billable
  expenses (`wip`), while `wipTime` is the labor-only number that reconciles to
  the project reports.
- **Firm billable == sum of project billable, structurally.** These are equal
  because indirect time can never be billable (enforced by a DB check
  constraint), so all billable value is project time. The test asserts this
  invariant.
- **"Filter by entity" = the existing entity switcher.** Reports are RLS-scoped
  to the active entity; the top-bar switcher changes it. Date range is a plain
  GET form (`?from=&to=`); WIP and AR are point-in-time balances, not
  range-filtered. Default window is year-to-date.
- **CSV export via authorized GET routes** under `/api/reports/*`. Any entity
  member may read reports; the route checks membership, runs the same
  `reports-db` functions through RLS, and streams `text/csv`. CSV shaping lives
  in `report-csv.ts`; escaping is RFC-4180 (`toCsv`).

## §7.7 Data import/export

- **Header detection over fixed positions.** The interim workbook tabs carry two
  title/instruction rows above the real header, so the importer locates the
  header row by matching known column labels (with synonyms) rather than
  assuming row 1. Normalization keeps `$`/`%`/`#` as words so "Billable?" and
  "Billable $" don't collide.
- **Validation report, not all-or-nothing.** Each importer returns
  {imported, updated, skipped, errors[]}; a bad row is skipped with a plain
  reason and does not block the rest. Verified against the real workbook: the
  greyed "example" rows are the only skips, each with a clear message.
- **Idempotent by natural key.** Employees (name), projects (code), clients
  (name), and indirect codes (code) are matched and updated in place on
  re-import, so loading a corrected file does not duplicate. Time entries are
  appended (no natural key), so a period should be imported once.
- **Time rows reference by human labels.** The workbook's Time tab names the
  employee and project by name (dropdowns), so the importer resolves project by
  name-or-code and employee by name, and reports "not found, import X first"
  when a dependency is missing. Import order is Employees, Indirect codes,
  Projects, then Time.
- **Imported time is `approved`.** Historical time is finalized work, so it
  lands approved (shows in reports immediately; managers can adjust). Amounts
  are recomputed from hours x rate for internal consistency with the schema
  checks rather than trusting the sheet's Billable $/Cost $ columns.
- **CSV parser is hand-rolled (no dependency).** A small RFC-4180 parser in
  `import.ts` (quotes, doubled quotes, CR/LF/CRLF, BOM) covers Excel exports;
  `toCsv` in `reports.ts` handles the export side. Export columns mirror the
  workbook so an export round-trips back through the importer.
- **One export route.** `/api/export?type=...&entityId=...` covers clients,
  projects, resources, indirect codes, expenses, invoices, and time entries;
  every list page has an Export CSV button. Same membership gate as the report
  routes.

## Signals step 3: consistency nudge

- **Shared meeting id via Outlook `iCalUId`.** A new `signal.shared_id` holds the
  calendar's shared event id, which is identical across every attendee's copy of
  the meeting. That's how we tell that several resources were in the same event
  without any cross-user calendar access.
- **Nudge, not enforcement.** `consistencyNudge` fires only when a strict
  majority of teammates (at least two) who logged the same meeting agree on a
  charge that differs from yours. Mixed charging on one meeting is legitimate,
  so it's a one-click suggestion ("3 of 4 logged this to P1 — Use their
  charge"), never a block.
- **Peers = accepted signals.** We compare against teammates who actually logged
  the meeting (accepted signals with the same shared_id, excluding your own),
  not open proposals. Using their charge reuses the normal accept path, so it
  also teaches the learned rule (step 2).
- **hookTimeout raised to 30s.** DB tests bootstrap a fresh PGlite and run all
  migrations in beforeEach; with the suite now at 20 files the default 10s hook
  timeout flaked under parallel load. The setup genuinely needs the time; this
  is not masking a logic failure.
