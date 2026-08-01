# CLAUDE.md — Engineering guardrails for HoldCo OS

This file governs how you (Claude Code) build this project. Read it before every task. The full requirements live in `HoldCo_OS_Product_Spec.md`; this file is the *how*, that file is the *what*.

## Prime directives
1. **Build only the current milestone.** Never build ahead of what the operator asked for. Phase/milestone order is in the spec §4 and §7. If asked to "build the app," build the **next** milestone only and stop.
2. **The operator is non-technical.** Explain what you did in plain language. Never make them edit code or run cryptic commands without a copy-pasteable, step-by-step instruction and what success looks like.
3. **When scope is ambiguous, ask before building.** One good question beats a wrong feature.

## Stack (fixed — do not substitute without explicit approval)
- TypeScript (strict mode on) · Next.js 15 App Router · React 19
- Tailwind CSS · shadcn/ui
- PostgreSQL on Supabase · Drizzle ORM (all schema changes via migrations)
- Supabase Auth (email + Google) with Row-Level Security
- Vitest (unit) · Playwright (e2e)
- Hosting: Vercel (app) + Supabase (data). Email: Resend. Errors: Sentry.

Do not add dependencies casually. Prefer the standard library and the stack above. If a new dependency is truly needed, name it, say why, and ask.

## Definition of done (every milestone)
A milestone is done only when **all** are true:
- The acceptance criteria in the spec for that milestone are met.
- Tests exist for those acceptance criteria and **pass** (`npm test` green; relevant Playwright specs green).
- Type-check and lint pass with no errors.
- A preview deploy works and you've given the operator a URL and a 3-line "what to click to verify" note.
- Nothing outside the milestone's scope changed.

Never report "done" while tests fail, types error, or an AC is unmet.

## Data & architecture rules
- **Every domain table** carries: `id`, `organization_id`, `entity_id` (where applicable), `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at` (soft delete). No hard deletes of financial records.
- **Scope every query** by `organization_id` and `entity_id`. Enforce with **RLS**, not just app code. Default-deny; grant via `membership`.
- **Schema changes only through Drizzle migrations.** Never hand-edit the database. Commit migration files.
- **Integrations behind adapter interfaces** (`AccountingProvider`, `SpvProvider`, `CapTableProvider`). The app must not import a vendor SDK outside its adapter.
- **Money:** store as integer minor units (cents) or `numeric`, never floating-point dollars. Round only at display. Guard divide-by-zero in every ratio (utilization, % fee used).
- **Dates & time zones:** store UTC; render in the entity's local zone. "Week ending" logic must be explicit and tested.
- **Exactly one of** `project_id` / `indirect_code_id` is set on a `time_entry`; enforce with a DB check constraint.
- Invoiced time flips to `invoiced` and is protected from re-billing at the DB level.

## Security rules
- Secrets only in environment variables (`.env.local`, Vercel/Supabase env). Never commit secrets. Provide a `.env.example` with keys and blank values.
- Validate and authorize every server action/route by role (spec §9). Financial actions (approve, invoice, void) are manager/admin/owner only.
- Write to `audit_log` on create/update/delete of any financial record (actor, timestamp, before/after).

## Workflow rules
- One milestone → one branch → one PR. Small, reviewable changes.
- **Tests first** for the acceptance criteria, then implement to green.
- Run a **reconciliation test** wherever the spec says numbers must tie out (reports vs. underlying records).
- Keep a running `README.md` (setup) and `docs/DECISIONS.md` (short notes on non-obvious choices).
- Provide a seed script that loads one realistic sample entity so screens are never empty.

## Communication rules
- Start each milestone by restating, in 2–3 lines, what you're about to build and its acceptance criteria.
- End each milestone with: what changed, the preview URL, how to verify, and what the next milestone is.
- If you hit a decision the operator should make (a vendor choice, a money/tax edge case, a data-model tradeoff), stop and ask in plain language.

## Explicit non-goals (do not build)
- No general ledger, journal entries, or financial statements — that's QuickBooks (integrate in Phase 2).
- No payroll engine, securities waterfalls, K-1s, or cap-table math — integrate (Gusto/ADP, Sydecar/Allocations, Carta).
- No multi-tenant productization work yet (keep the `organization` boundary in the schema, but single-org only until told otherwise).
- No microservices, no custom auth, no hand-rolled ORM.
