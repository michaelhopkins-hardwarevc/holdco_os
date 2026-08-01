# HoldCo OS — First Claude Code Session

Paste the prompts below into Claude Code **one at a time**, in order. After each one finishes, do the quick verify step, then paste the next. If Claude Code asks you a question you're unsure about, bring it to me.

---

## Before you start (one-time, ~20 min)

1. **Get the tools:** install Node.js (LTS) and Git, and install Claude Code (`npm install -g @anthropic-ai/claude-code`, then run `claude` in a terminal — or use the Claude Code integration in your editor).
2. **Create free accounts:** GitHub, Vercel, Supabase, Resend, Sentry. Don't configure anything — Claude Code will tell you exactly what to click.
3. **Make a project folder**, put `HoldCo_OS_Product_Spec.md` and `CLAUDE.md` inside it, and open Claude Code in that folder.

You do **not** need to understand the code. Your job is to paste, click the preview links, and confirm things look right.

---

## Prompt 1 — Scaffold the project and prove the pipeline

```
Read HoldCo_OS_Product_Spec.md and CLAUDE.md in this folder — they govern this project.

This is a brand-new project. Milestone: PROJECT SCAFFOLD ONLY. Do not build any features yet.

Scaffold a Next.js 15 app (App Router, TypeScript strict) with Tailwind CSS, shadcn/ui,
Drizzle ORM configured for Supabase Postgres, Vitest and Playwright, and ESLint/Prettier.
Initialize a git repo, add a .env.example listing every key with blank values, and write a
README with setup steps.

I am non-technical. For anything I must do in a browser (creating the Supabase project and
getting its keys, connecting GitHub, connecting Vercel), give me exact, numbered,
copy-pasteable instructions and tell me what success looks like at each step.

Finish by deploying a placeholder home page to Vercel so we confirm the whole pipeline works.
Stop when you can give me a live URL. Follow CLAUDE.md.
```

**Verify:** you can open the live Vercel URL and see the placeholder page.

---

## Prompt 2 — Build the database schema and sample data

```
Milestone: DATABASE SCHEMA + SEED (spec §6). Use Drizzle migrations only — do not hand-edit
the database.

Create the Phase 1 tables from §6.1–6.3: organization, entity, user, membership, client,
contact, project, phase, resource, rate_override, indirect_code, time_entry, expense, invoice,
invoice_line, payment. Apply the standard audit columns and rules from CLAUDE.md: soft deletes,
money stored as integer cents, and a DB check constraint that exactly one of project_id /
indirect_code_id is set on a time_entry.

Also create the later-phase tables from §6.4 as empty scaffolding (no UI).

Enable row-level security with default-deny on every table.

Write a seed script that loads one realistic sample design-firm entity with a few resources,
clients, projects with phases, the standard indirect codes, and one week of time entries.

Write tests proving the migrations apply cleanly and the seed loads. Show me the tests passing.
Follow CLAUDE.md.
```

**Verify:** Claude Code shows the test run passing, and you can see the sample entity's data (it will tell you how — e.g., in the Supabase table view).

---

## Prompt 3 — Build the entity / user / role foundation (§7.1)

```
Milestone: §7.1 ENTITIES, USERS, ROLES. First restate the §7.1 acceptance criteria, then write
tests for them, then implement to green.

Build Supabase Auth login (email + Google). Build entity create/edit, an invite-user-by-email
flow, per-entity role assignment via the membership table, and an entity switcher in the app
header that scopes every list to the selected entity.

Enforce access with row-level security so a staff user of one entity CANNOT read another
entity's rows through the API — write an automated test that proves this.

End with a preview URL and 3 lines telling me exactly what to click to verify the acceptance
criteria. Follow CLAUDE.md. Do not build anything beyond §7.1.
```

**Verify:** on the preview URL, log in, create two entities, switch between them, and confirm each shows only its own data.

---

## After that
You've got a working, deployed foundation with real auth and multi-entity security. From here, keep going through the spec **§7.2 → §7.3 → …**, one milestone per prompt, using the same pattern: *"Build §7.x per the spec. Restate the acceptance criteria, write tests first, implement to green, give me a preview URL and how to verify. Follow CLAUDE.md."*

Keep using the interim Excel workbook for real time and billing until §7.5 (invoicing) is verified in production. Bring me anything that gets stuck.
