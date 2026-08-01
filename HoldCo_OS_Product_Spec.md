# HoldCo OS — Product & Requirements Specification

**A back-office operating system for a multi-entity holding company, professional-services firm, product company, and venture studio.**

Prepared for Michael Hopkins · Brooks Stevens / Marmik HoldCo · v1.0 · August 1, 2026

> **Working name:** "HoldCo OS." Brandable later (e.g. *Marmik OS*). The name is a variable, not a commitment.

---

## 0. How to use this document

This is a specification written to be **handed to Claude Code** to build the software, and to be read by a non-technical owner directing that build. It is deliberately opinionated: it picks the stack, the architecture, and the build order so you don't have to make those calls mid-build.

Two companion rules:

1. **Build in the order in Section 4.** Do not let Claude Code build everything at once. Work **one milestone at a time**, verify it against the acceptance criteria, then move on. Section 12 explains how to run each milestone.
2. **`CLAUDE.md` (delivered alongside this file) is law.** It contains the engineering guardrails Claude Code must follow. Keep it in the repository root; Claude Code reads it automatically.

---

## 1. Vision & context

### 1.1 The problem
The enterprise spans several legal entities that today have no shared operational spine:

| Entity | Role |
|---|---|
| **Brooks Stevens Design Associates** | 90-year industrial design + engineering firm (professional services; billable projects). |
| **STS Technical Design** *(pending acquisition)* | Engineering firm being acquired; same project-accounting needs as Brooks Stevens. |
| **Marmik** | C-corp **shared-services hub** — the natural home/owner of this software and of cross-entity cost allocation. |
| **Vault (Vault Aftermarket)** | Powersports product company; IP spinning out; portfolio company with its own P&L and KPIs. |
| **Hardware Venture Studio** | Creates/funds companies via **SPVs** (several $5–7M vehicles) and a planned **~$50M fund** (late 2027). |
| **Roll-up portfolio** | Thesis to acquire and integrate up to ~50 service/product companies over 5 years. |

Ajera (just lost) covered only the professional-services slice. Nothing covers the **holding-company view**: consolidated performance across entities, shared-services allocation, the acquisition pipeline, SPV/fund operations, and portfolio KPIs. That gap is the product.

### 1.2 The strategy: two layers
- **Commodity layer — integrate, never rebuild.** General ledger, payroll, banking, e-signature, cap-table math, and securities/tax (K-1) reporting are solved and regulated. Connect best-of-breed systems (QuickBooks Online, Gusto/ADP, Mercury/Ramp, Carta, Sydecar/Allocations). Rebuilding a GL is the single most common way custom back-office projects fail.
- **Differentiated layer — build this.** The *holding-company / venture-studio operating system* that sits on top: multi-entity project accounting, shared-services allocation, consolidated reporting, deal & partner pipeline, SPV/fund ops, and portfolio KPIs. **This is where the durable, potentially productizable value lives.**

### 1.3 What "success" looks like
- Phase 1: Brooks Stevens **and** STS run all time, billing, and project profitability here — Ajera fully replaced, one system across both firms.
- Phase 2+: a single login shows the HoldCo owner the health of every entity, the acquisition pipeline, and every SPV — with the regulated accounting still living in the systems built for it.

---

## 2. Product principles

1. **Multi-entity from line one.** Every record belongs to an `entity`. There is no "the company" — there are many, and the system rolls them up.
2. **Integrate the regulated, build the differentiated.** (Section 1.2.)
3. **Single source of operational truth, not of legal record.** The GL of record stays in QuickBooks per entity; HoldCo OS is the operating layer and consolidator.
4. **Auditable by default.** Every mutation is timestamped and attributed; nothing is hard-deleted.
5. **Cheap to run, simple to operate.** Managed services, generous free tiers, dashboards a non-engineer can navigate.
6. **Don't foreclose the product path.** Architect for future multi-tenancy (an `organization` boundary exists from day one) but do **not** pay for full productization now. Single-org until there's a reason.
7. **Boring, well-documented technology.** Chosen so Claude Code and a non-specialist operator can maintain it.

---

## 3. Scope — build vs. integrate

| Capability | Decision | Rationale |
|---|---|---|
| Project time tracking (billable + indirect) | **Build** | Core differentiated workflow; Ajera replacement. |
| Billing / invoicing / WIP / AR | **Build** | Tightly coupled to project data; drives cash. |
| Project profitability & utilization | **Build** | The reason the firm needs this. |
| Shared-services / intercompany allocation (Marmik) | **Build** | No off-the-shelf tool models this cleanly. |
| Multi-entity consolidated reporting & portfolio KPIs | **Build** | The HoldCo command center. |
| Deal & partner pipeline (acquisitions, recruiting) | **Build** | Roll-up engine; a specialized CRM. |
| SPV / fund operations dashboard & LP view | **Build (thin) + integrate** | Own the studio's *view*; let a platform run the securities/tax mechanics. |
| General ledger, AP, financial statements | **Integrate (QuickBooks Online)** | Regulated, solved, expected by CPAs. |
| Payroll | **Integrate (Gusto or ADP)** | Compliance-heavy; feeds the GL. |
| Banking / cards / spend | **Integrate (Mercury / Ramp)** | Later; via API or CSV. |
| Cap table & QSBS/trust stack tracking | **Integrate (Carta) + thin build** | Carta owns the math; we track the studio's rollup view. |
| SPV formation, capital calls, distributions, K-1s | **Integrate (Sydecar / Allocations / AngelList)** | Securities + tax; do not build. |
| E-signature | **Integrate (DocuSign / Dropbox Sign)** | Commodity. |

---

## 4. Phased roadmap

Build strictly in this order. Each phase is independently useful.

- **Phase 1 — Project Accounting Core (Brooks Stevens + STS).** Entities, users/roles, clients, projects/phases, time entry (billable + indirect), expenses, invoicing, WIP/AR, utilization, project profitability, CSV import/export. *This replaces Ajera.* **Detailed in Section 7.**
- **Phase 2 — QuickBooks integration + Consolidated reporting.** Per-entity QBO connections; push invoices/AR; pull trial balance; shared-services allocation (Marmik); consolidated P&L and portfolio KPI dashboard.
- **Phase 3 — Deal & Partner Pipeline.** Acquisition CRM (targets, stages, industry, revenue/EBITDA, diligence checklists), partner-recruiting tracker, post-close integration tracker for acquired companies.
- **Phase 4 — SPV & Fund Operations.** Vehicles, LPs, commitments, capital calls, distributions, a read-only LP portal; integrate the chosen SPV platform; fund-level dashboard.
- **Phase 5 — Cap Table & QSBS view.** Entity ownership rollup, trust/beneficiary stack, QSBS eligibility clock; integrate Carta.

Phases 2–5 are **scaffolded** in the data model now (Section 6.4) so the schema doesn't need painful rewrites later, but only Phase 1 is built to completion first.

---

## 5. Technology stack & architecture

### 5.1 Stack (chosen — do not substitute without reason)

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict) | One language front-to-back; strong typing catches errors early. |
| Framework | **Next.js 15 (App Router) + React 19** | Full-stack in one project; excellent Claude Code support; deploys in one click. |
| UI | **Tailwind CSS + shadcn/ui** | Clean, accessible components; fast to build; consistent look. |
| Database | **PostgreSQL via Supabase** | Managed Postgres + Auth + Storage + row-level security in one dashboard. No servers to run. |
| ORM / migrations | **Drizzle ORM** | Type-safe schema; migration files are readable and versioned. |
| Auth | **Supabase Auth** (email + Google SSO) | Built in; roles enforced with row-level security. |
| Background jobs | **Vercel Cron + Route Handlers** | Scheduled syncs (e.g., nightly QBO pull) without extra infra. |
| Hosting | **Vercel** (app) + **Supabase** (data) | Both have simple dashboards a non-engineer can manage; cheap at this scale. |
| Email | **Resend** | Invoices, invites, notifications. |
| File storage | **Supabase Storage** | Receipts, invoice PDFs, documents. |
| Testing | **Vitest** (unit) + **Playwright** (end-to-end) | Proves each milestone before moving on. |
| Error monitoring | **Sentry** | See failures in production. |

Deferred until needed: Stripe (only if productized), a dedicated queue/worker (only if syncs outgrow cron).

### 5.2 Architecture

- **Modular monolith.** One Next.js app, organized into feature modules (`entities`, `projects`, `time`, `billing`, `reporting`, `integrations`, …). Not microservices — that complexity isn't warranted.
- **Tenancy & entity scoping.** Two scoping columns exist on almost every table: `organization_id` (future multi-tenant boundary — one org for now) and `entity_id` (the legal entity). **Row-level security** enforces that a user only sees rows for entities they're a member of.
- **Integrations as adapters.** Each external system (QBO, Sydecar, Carta) sits behind an adapter interface (`AccountingProvider`, `SpvProvider`, …) so providers can be swapped and so the app never hard-codes one vendor's API shape.
- **Everything auditable.** Standard columns on every table: `id`, `organization_id`, `entity_id` (where applicable), `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at` (soft delete). A central `audit_log` records mutations to financial records.
- **API-first.** Server logic lives in typed route handlers / server actions; the UI consumes them. This keeps a clean seam if a mobile app or public API is added later.

### 5.3 Environments
`local` (developer machine) → `preview` (every change gets a Vercel preview URL) → `production`. Separate Supabase projects for `production` and `staging`. Secrets in environment variables only — never in code.

---

## 6. Data model

Notation: `PK` primary key, `FK` foreign key. All tables carry the standard audit columns from §5.2 unless noted.

### 6.1 Core / identity
- **organization** — `id (PK)`, `name`, `slug`. (Single row for now; the future product boundary.)
- **entity** — `id (PK)`, `organization_id (FK)`, `name`, `legal_name`, `type` (`services` | `product` | `holdco` | `shared_services` | `studio` | `spv` | `fund` | `portfolio`), `status`, `base_currency` (default USD), `qbo_connection_id (FK, nullable)`. *Examples: Brooks Stevens (services), STS (services), Vault (product), Marmik (shared_services), Studio (studio).*
- **user** — `id (PK)`, `email`, `name`, `auth_id` (Supabase). 
- **membership** — `id (PK)`, `user_id (FK)`, `entity_id (FK)`, `role` (`owner` | `admin` | `manager` | `staff` | `viewer` | `lp`). A user can belong to many entities with different roles.

### 6.2 Clients & projects (Phase 1)
- **client** — `id (PK)`, `entity_id (FK)`, `name`, `status`, `billing_terms`, `address`, `notes`.
- **contact** — `id (PK)`, `client_id (FK)`, `name`, `email`, `phone`, `role`.
- **project** — `id (PK)`, `entity_id (FK)`, `client_id (FK)`, `code`, `name`, `type` (`time_materials` | `fixed_fee` | `cost_plus` | `not_to_exceed` | `internal`), `status` (`prospect` | `active` | `on_hold` | `closed`), `contract_value`, `start_date`, `end_date`, `project_manager_id (FK → user)`, `notes`.
- **phase** — `id (PK)`, `project_id (FK)`, `name`, `code`, `budget_hours`, `budget_amount`, `sort_order`.

### 6.3 People, time & billing (Phase 1)
- **resource** — `id (PK)`, `entity_id (FK)`, `user_id (FK, nullable)`, `name`, `title`, `bill_rate`, `cost_rate`, `target_utilization`, `status`. *(A "resource" is a billable person; may or may not be a login user.)*
- **rate_override** — `id (PK)`, `project_id (FK, nullable)`, `resource_id (FK, nullable)`, `role`, `bill_rate`, `effective_date`. *(Optional per-project or per-role rates.)*
- **indirect_code** — `id (PK)`, `entity_id (FK)`, `code`, `category` (`overhead` | `pto` | `holiday` | `sick` | `business_dev` | `training` | `admin` | `rnd`), `description`, `active`.
- **time_entry** — `id (PK)`, `entity_id (FK)`, `resource_id (FK)`, `work_date`, `charge_type` (`project` | `indirect`), `project_id (FK, nullable)`, `phase_id (FK, nullable)`, `indirect_code_id (FK, nullable)`, `hours`, `billable` (bool), `bill_rate`, `cost_rate`, `billable_amount`, `cost_amount`, `notes`, `status` (`draft` | `submitted` | `approved` | `invoiced`). *(Exactly one of project_id / indirect_code_id is set.)*
- **expense** — `id (PK)`, `entity_id (FK)`, `resource_id (FK)`, `project_id (FK, nullable)`, `expense_date`, `category`, `amount`, `billable` (bool), `markup_pct`, `receipt_url`, `status`.
- **invoice** — `id (PK)`, `entity_id (FK)`, `client_id (FK)`, `project_id (FK, nullable)`, `number`, `invoice_date`, `period_start`, `period_end`, `status` (`draft` | `sent` | `paid` | `void`), `subtotal`, `tax`, `total`, `amount_paid`, `terms`, `qbo_id` (nullable), `pdf_url`.
- **invoice_line** — `id (PK)`, `invoice_id (FK)`, `source` (`time` | `expense` | `fixed` | `manual`), `source_id` (nullable), `description`, `quantity`, `rate`, `amount`.
- **payment** — `id (PK)`, `invoice_id (FK)`, `payment_date`, `amount`, `method`, `reference`.

### 6.4 Scaffolded for later phases (create tables, minimal columns, don't build UI yet)
- **Phase 2:** `qbo_connection` (entity_id, tokens, realm_id, status), `sync_map` (local_type, local_id, provider, external_id), `allocation_rule` (from_entity, to_entity, basis, pct/driver), `financial_snapshot` (entity_id, period, account, amount) for consolidated reporting.
- **Phase 3:** `deal` (target_name, industry, stage, revenue, ebitda, owner_id, source, status), `deal_activity`, `diligence_item`, `partner` (name, business, stage, notes), `integration_task` (acquired entity onboarding).
- **Phase 4:** `vehicle` (type spv|fund, name, target_size, entity_id), `investor` (LP), `commitment`, `capital_call`, `capital_call_line`, `distribution`, `spv_connection`.
- **Phase 5:** `security_class`, `holding` (holder, entity, class, units), `beneficiary`, `qsbs_lot` (entity, holder, acquired_date, basis, eligible_date).

*Scaffolding = the migration creates the tables so relationships are stable, but no screens are built until that phase.*

---

## 7. Phase 1 — detailed requirements

**Goal:** Brooks Stevens and STS run entirely on HoldCo OS for time, expenses, billing, and project profitability. This is the Ajera replacement and the foundation everything else builds on.

Each feature below is written as user stories with **acceptance criteria** (AC). A milestone is "done" only when its ACs pass and tests are green.

### 7.1 Foundation: entities, users, roles
- As an owner, I can create entities (Brooks Stevens, STS, Vault, Marmik, Studio) and see a switcher to move between them.
- As an admin, I can invite users by email and assign them a role per entity.
- **AC:** RLS proven — a `staff` user of Brooks Stevens cannot read STS rows via the API. Entity switcher filters every list. Roles gate actions (staff can enter time but not approve; manager can approve; admin can configure).

### 7.2 Setup: clients, projects, phases, resources, indirect codes
- As a manager, I can create clients and contacts.
- As a manager, I can create projects (with type, contract value, PM, status) and phases with budgets.
- As an admin, I can maintain resources (bill rate, cost rate, target utilization) and indirect codes (pre-seeded with the standard overhead buckets).
- **AC:** A project with phases displays a budget summary. Deactivating a resource hides it from new time entry but preserves history. Seed script loads a realistic sample entity so screens aren't empty.

### 7.3 Time entry (the core workflow)
- As a staff member, I get a **weekly timesheet grid**: rows = project/phase or indirect code, columns = days, cells = hours. I can also add single entries.
- Billable flag, bill rate, and cost rate **auto-populate** from the project/resource but are overridable by a manager.
- Billable amount = hours × bill rate (billable only); cost amount = hours × cost rate (always).
- I can **submit** a week; a manager can **approve** or reject with a note.
- **AC:** A submitted week locks against edits until rejected. Totals per day and per week are correct. Indirect time never produces a billable amount. Approvals are recorded in the audit log. Entering time works on a phone-sized screen.

### 7.4 Expenses
- As a staff member, I can log project expenses with a receipt upload, category, and billable flag (with optional markup).
- **AC:** Billable expenses become available to invoicing; receipts are stored and viewable; non-billable expenses are excluded from client invoices.

### 7.5 Invoicing, WIP & AR
- As a manager, I can generate a **draft invoice** for a project and period that pulls all **approved, uninvoiced** billable time and expenses into invoice lines (grouped by phase/resource, configurable).
- I can edit lines, add manual/fixed-fee lines, then mark **sent**; record **payments**; see status.
- The system tracks **WIP** (approved billable value not yet invoiced) and **AR** (invoiced not yet paid), with AR aging.
- **AC:** Time pulled into an invoice flips to `invoiced` and cannot be double-billed. Fixed-fee projects can invoice by milestone independent of hours. A branded **PDF** is generated and stored. AR aging buckets (0–30/31–60/61–90/90+) reconcile to invoice/payment records.

### 7.6 Reporting & dashboards (Phase 1)
- **Project profitability:** budget vs actual (hours & $), billable value, cost, margin, % fee used, WIP — per project and per phase.
- **Utilization:** billable vs total hours per resource vs target, by period.
- **Firm dashboard:** billable $, cost, margin, utilization, WIP, AR outstanding — filterable by entity and date range.
- **AC:** Numbers tie out to the underlying time/invoice records (a reconciliation test proves totals match). Every report exports to CSV.

### 7.7 Data import/export
- As an admin, I can **import** clients, projects, resources, and historical time from CSV (mapped to the interim workbook's columns) so the bridge workbook and any Deltek export load cleanly.
- Everything exports to CSV; financial records are never trapped.
- **AC:** Importing the interim workbook's Projects/Employees/Time tabs produces correct records with a validation report for bad rows.

---

## 8. Integrations specification

### 8.1 QuickBooks Online (Phase 2, first integration)
- **Auth:** OAuth 2.0 per entity; store tokens in `qbo_connection`; refresh automatically.
- **Push:** on invoice `sent`, create/update the matching QBO invoice; store `qbo_id` in `sync_map`. Push customers/clients as needed.
- **Pull:** nightly (Vercel Cron) pull trial balance / P&L into `financial_snapshot` for consolidated reporting.
- **Adapter:** implement behind an `AccountingProvider` interface. **AC:** an invoice marked sent appears in that entity's QBO with matching total; re-syncing does not duplicate.

### 8.2 SPV / fund platform (Phase 4)
- Integrate the selected platform — **Sydecar**, **Allocations**, or **AngelList** — for formation, capital calls, distributions, and K-1s. Start with **manual/CSV** LP and commitment entry; add API sync when a platform is chosen. Do **not** compute securities waterfalls or tax in-house.

### 8.3 Cap table (Phase 5)
- Integrate **Carta** for the authoritative cap table; HoldCo OS holds only the cross-entity ownership *rollup* and the QSBS/trust-stack *view*. Legal/tax determinations stay with counsel and Carta.

### 8.4 Later / commodity
Payroll (**Gusto**/**ADP** → GL), banking (**Mercury**/**Ramp**), e-sign (**DocuSign**/**Dropbox Sign**), email (**Resend**). All behind adapters; all deferred until their phase.

---

## 9. Non-functional requirements
- **Roles & permissions:** enforced at the database (RLS) and UI. Financial actions (approve, invoice, void) restricted to manager/admin/owner.
- **Audit trail:** every create/update/delete of a financial record writes to `audit_log` with actor, timestamp, before/after.
- **Data portability:** CSV export on every list; scheduled database backups (Supabase point-in-time recovery enabled).
- **Performance:** list views paginate; dashboards render < 2s on a year of data for a 40-person firm.
- **Responsive:** time entry and approvals usable on mobile; management/reporting optimized for desktop.
- **Accessibility:** shadcn/ui defaults kept (keyboard nav, contrast).
- **Observability:** Sentry on client and server; a health-check route.
- **Seed & demo data:** a script populates a realistic sample entity for every environment.

## 10. Security & compliance
- Secrets only in environment variables; never committed. Rotate integration tokens.
- Row-level security default-deny; access granted only through `membership`.
- Least-privilege roles; owner-only for destructive/config actions.
- PII (client contacts, resource comp) access-limited by role.
- This system is **not** the book of record for securities, tax, or payroll compliance — those live in the integrated regulated platforms. Keep that boundary explicit in the UI (e.g., "GL of record: QuickBooks").

## 11. Later phases — capsule specs
- **Phase 2 — QBO + Consolidation:** per-entity QBO connect; invoice push + TB pull; **shared-services allocation** (Marmik costs distributed to entities by a configurable basis); consolidated P&L and a **portfolio KPI board** (per-entity revenue, margin, utilization, cash, plus product KPIs like Vault revenue and SPV-startup metrics).
- **Phase 3 — Deal & Partner Pipeline:** acquisition CRM (stages from sourced → LOI → diligence → closed), targets with industry/revenue/EBITDA for the roll-up, diligence checklists, partner-recruiting tracker (partners bringing businesses), and a post-close **integration tracker**.
- **Phase 4 — SPV & Fund Ops:** vehicles, LPs, commitments, capital calls, distributions, a **read-only LP portal**, and a fund/SPV dashboard; integrate the chosen SPV platform.
- **Phase 5 — Cap Table & QSBS View:** ownership rollup across entities, trust/beneficiary stack, QSBS eligibility clock; integrate Carta.

## 12. How to build this with Claude Code (operator guide)

You are non-technical; this is written for that. Claude Code does the engineering — your job is to **direct, verify, and keep it on the rails**.

**One-time setup (Claude Code will walk you through each):**
1. Create free accounts: GitHub, Vercel, Supabase, Resend, Sentry.
2. Ask Claude Code to **scaffold the project** (Next.js + TypeScript + Tailwind + shadcn/ui + Drizzle + Supabase) and connect the GitHub repo. Put this spec and `CLAUDE.md` in the repo root.
3. Have Claude Code set up the database schema from Section 6 (Phase 1 tables + scaffolded later tables) as a migration, plus the seed script.

**Then build milestone by milestone (Section 7 order):**
- Prompt one milestone at a time, e.g.: *"Build §7.3 Time entry per the spec. Follow CLAUDE.md. Write tests for the acceptance criteria, then implement, then show me it passing."*
- After each milestone, ask for: a **passing test run**, a **preview URL** to click through, and a short note of what changed.
- **Verify against the acceptance criteria yourself** by clicking through the preview. Don't accept "done" without seeing the ACs demonstrated.
- Only then move to the next milestone. Commit/deploy at each green milestone.

**Guardrails to repeat when needed:** "Don't build ahead of the current milestone." · "Use a database migration, don't edit the schema by hand." · "Put secrets in environment variables." · "Write the tests first." · "If you're unsure about scope, ask me before building."

**Reality check on effort.** Phase 1 is a real application — plan for weeks of iterative building, not an afternoon. **Keep operating on the interim Excel workbook (already delivered) until Phase 1's time/billing is verified in production.** Don't cut over live billing to new software until §7.5 passes its acceptance criteria with real data.

---

## 13. Glossary
- **Entity** — a legal company in the portfolio (Brooks Stevens, STS, Vault, Marmik, Studio, an SPV…).
- **Indirect time** — non-billable hours (overhead, PTO, BD, admin, R&D).
- **WIP** — work in progress: approved billable value not yet invoiced.
- **AR** — accounts receivable: invoiced amounts not yet paid.
- **Shared services** — costs incurred centrally (Marmik) and allocated to entities.
- **SPV** — special-purpose vehicle used to make a single investment.
- **QSBS** — Qualified Small Business Stock; a tax-exclusion regime the entity structure is designed around.
- **RLS** — row-level security: database rules ensuring users see only permitted rows.
- **Adapter** — a swappable module wrapping an external system's API.
