# HoldCo OS — Spec Addendum: Identity + Intake & Intelligence Layer

Companion to `HoldCo_OS_Product_Spec.md` · v1.0 · adds four capabilities: **SSO**, **Meeting-note intelligence**, **Proposals**, and **Plans**.

> **The big idea.** SSO is the identity foundation. Meeting notes + Proposals + Plans form an **Intake & Intelligence layer** that sits *in front of* the Phase 1 project-accounting core. The plan tells the system what work is *expected*; meeting notes tell it what *happened*; proposals turn a "yes" into a project automatically. Net effect: time entry, budgets, and project setup become **AI-assisted and mostly pre-filled** instead of manual. Keep a human in the loop on anything financial.

---

## A. Where these fit in the roadmap

Do **not** build these before the Phase 1 core (Spec §7) is working. Recommended insertion:

| New module | Build vs integrate | Suggested slot | Depends on |
|---|---|---|---|
| **A1. Enterprise SSO & directory** | Integrate | **Phase 1.5** (right after core) | Foundation / §7.1 auth |
| **A2. Proposals & e-sign → auto-create project** | Build + integrate e-sign | **Phase 2A** (after core, alongside/after QBO) | Projects/phases (§7.2), Clients |
| **A3. Plans → phases, budgets & capacity** | Build + integrate PM tools | **Phase 2A** (with Proposals) | Projects/phases, Resources |
| **A4. Meeting-note intelligence** | Integrate transport + build AI layer | **Phase 2B** (after Proposals/Plans) | Projects, Time, Resources |

Rationale: identity first (everyone needs a login); then the proposal/plan pipeline (it creates the projects and budgets everything else hangs on); then meeting intelligence (it attaches insights to projects/time that must already exist).

---

## A1. Enterprise SSO & directory

**Goal:** employees sign in with their company identity; agnostic across identity providers so acquired companies keep their own.

**Two tiers — don't confuse them:**
1. **Social sign-in** ("Sign in with Microsoft / Google") — already available in Supabase Auth (Azure/Entra + Google providers). Cheapest path; good enough for Brooks Stevens (Microsoft 365 / Entra ID) and Google-based firms **today**.
2. **True enterprise SSO** — SAML/OIDC federation to a company's identity provider, plus **SCIM** directory sync so users are auto-provisioned *and de-provisioned* when they join/leave. This is what makes it agnostic across many companies at scale.

**Recommendation:**
- **Now:** enable Entra ID (Microsoft 365) and Google via Supabase Auth. Covers Brooks Stevens immediately.
- **When onboarding companies with their own IdPs:** add **WorkOS** (purpose-built "SSO + SCIM as a service," IdP-agnostic — Entra, Google Workspace, Okta, etc.). Auth0 is the alternative. This keeps the app from hand-rolling SAML per company.

**Data model:** `sso_connection` (organization_id, provider `oidc|saml`, idp, config/metadata, status); extend `user` with `sso_subject`, `external_directory_id`. `membership` already carries roles — SCIM maps directory groups → roles.

**Guardrails:** SSO config is org/admin-only; SCIM must **de-provision** (offboarding closes access automatically — important as headcount grows to ~40 and across acquisitions).

---

## A2. Proposals → automatic project creation

**Goal:** write/send a proposal (SOW); when the client accepts (e-signs), the project, phases, and budget are created in the system automatically — no re-keying.

**Flow:** Draft proposal (optionally AI-assisted from meeting notes, see A4) → send for e-signature → **on "completed" webhook, auto-create the project** (client, type, contract value) and its **phases + budgets from the embedded plan** (A3) → link back to the proposal.

**Build vs integrate:** build the proposals module; **integrate e-signature** (DocuSign or Dropbox Sign) and listen to its completion webhook.

**Data model:**
- `proposal` (entity_id, client_id, deal_id?, number, title, status `draft|sent|viewed|accepted|declined|expired`, amount, type, valid_until, sent_at, accepted_at, esign_envelope_id, created_from `manual|meeting_note`, project_id? [set on acceptance]).
- `proposal_line` (proposal_id, description, qty, rate, amount, plan_item_ref?).

**Guardrails:** acceptance creates a **draft** project for one-click confirmation (don't silently spawn live billable projects); prevent duplicates if a proposal is re-sent; connect to the Deal Pipeline (Phase 3) so an accepted proposal can close its originating deal.

---

## A3. Plans → phases, budgets, capacity & predictive time

**Goal:** the high-level plan inside a proposal becomes the project's phases and budgets, a **capacity/resourcing forecast**, and the basis for **predictive time tracking**.

**What a plan drives:**
1. **Project structure:** each plan phase → a `phase`; each task → optional sub-item, with `estimated_hours`, role, and budget.
2. **Capacity planning:** planned hours per person per period vs. each resource's available hours → over/under-allocation view ("how much time people have for tasks").
3. **Predictive/assisted time:** the plan sets *expected* hours by person/phase/week; actuals track against it; variance surfaces early; timesheets can be **pre-filled** from allocations (confirmed by the person).
4. **PM-tool sync:** push phases/tasks to a project-management tool and pull status back. You already use **Monday.com** — start there; design for Asana/Jira/ClickUp too.

**Build vs integrate:** build the plan + capacity model; **integrate PM tools** via their APIs behind a `PmProvider` adapter.

**Data model:**
- `plan` (proposal_id?, project_id?, name, status).
- `plan_item` (plan_id, parent_id? [phase→task hierarchy], name, type `phase|task|milestone`, estimated_hours, role, assigned_resource_id?, start_date, end_date, budget_amount, pm_external_id?).
- `resource_capacity` (resource_id, period, available_hours).
- `allocation` (plan_item_id or project_id, resource_id, period, planned_hours) — the predictive layer time entry compares against.
- `pm_connection` (provider, tokens) + `pm_sync_map` (plan_item_id ↔ external task id).

**Guardrails:** planned ≠ actual — never auto-post planned hours as real time entries; they are *suggestions* the person confirms. Keep budgets versioned so re-planning doesn't erase history.

---

## A4. Meeting-note intelligence

**Goal:** the AI meeting summaries your team already gets by email become structured signals — suggested timesheet entries, proposal/SOW drafts, project/phase updates, action items, and scope-change alerts.

**Integration approach (two options — start with the first):**
1. **Email ingestion (recommended first).** Everyone already gets summaries by email, so give the system a dedicated address (e.g., `notes@yourdomain`) that people CC or auto-forward summaries to. An **inbound-email service** (Resend Inbound, Postmark, or SendGrid Inbound Parse) hands the message to the app; an **AI extraction step (Anthropic API / Claude)** turns it into structured insights. Works with *any* notetaker (Otter, Fireflies, Fathom, Read, tl;dv, Zoom/Teams AI, etc.) with zero per-vendor work.
2. **Transcript API (later, richer).** Integrate **Recall.ai** (one API for a meeting bot + transcripts across Zoom/Meet/Teams) or a specific notetaker's API for fuller transcripts and speaker/time data. Add once the email version proves value.

**What the AI extracts → where it goes:**
- **Time suggestions:** "60 min on Project X, Tue" → a **draft time entry** the person confirms. *(Highest-value feature — it attacks the #1 PSA pain, unlogged time.)*
- **Proposal/SOW hints:** discovery-call notes → a **draft proposal** (feeds A2).
- **Project/phase updates:** kickoff notes → suggested phases/tasks/budgets (feeds A3).
- **Action items, decisions, scope changes:** logged against the project; scope changes flagged for a change order.

**Data model:**
- `meeting_note` (organization_id, source `email|recall|otter|...`, external_id, received_at, meeting_title, meeting_date, participants[], raw_text/url, project_id?, client_id?, processed).
- `extracted_insight` (meeting_note_id, type `time_suggestion|proposal_hint|plan_update|action_item|scope_change|decision|risk`, payload json, status `suggested|accepted|dismissed`, linked refs).

**Guardrails — this is the sensitive one:**
- **Human-in-the-loop always.** Nothing financial (a billable time entry, an invoice) is created from AI without a person confirming it.
- **Consent & privacy.** Meeting content is sensitive. Per-user opt-in; clear notice; a retention policy; restrict who can see whose notes (respect the entity/RLS boundary). Note that recording/consent laws vary by state — surface a consent setting rather than assume.
- **Attribution & security.** Verify the inbound sender; don't ingest from unknown addresses. Store transcripts encrypted; allow deletion.

---

## B. How it all connects (the loop)

```
Company identity (SSO/SCIM)  →  who is who, auto-provisioned
        │
Meeting notes (email/Recall) ─┐
Proposal accepted (e-sign)  ──┼─►  PROJECT + PHASES + BUDGETS  (auto-created)
Plan (inside proposal)      ──┘         │
        │                               ▼
        │                     Allocations (planned hours by person/period)
        ▼                               │
 AI time SUGGESTIONS  ───────────────►  TIME ENTRY (confirm, don't type)
        │                               │
        └────────────►  Actuals vs plan, WIP, billing, utilization, margin  ◄── Phase 1 core
```

The core stays the system of truth for hours and dollars; the intake/intelligence layer just makes filling it fast and predictive. Regulated pieces (GL, e-sign, SSO, transcripts) stay integrated, per the master spec's build-vs-integrate rule.

---

## C. New integrations summary

| Capability | Integrate | Notes |
|---|---|---|
| Enterprise SSO / directory | Entra ID + Google (Supabase now) → **WorkOS** (agnostic, later) | SCIM for auto de-provisioning |
| E-signature | DocuSign / Dropbox Sign | Completion webhook → create project |
| Inbound email (notes) | Resend Inbound / Postmark / SendGrid Parse | Dedicated `notes@` address |
| Meeting transcripts (later) | Recall.ai (aggregator) or notetaker API | Only if email version isn't enough |
| AI extraction | Anthropic API (Claude) | Structured-output extraction; human-confirmed |
| PM tools | **Monday.com** first; Asana/Jira/ClickUp | Behind a `PmProvider` adapter |

---

## D. Claude Code build order for this layer (after Phase 1 core)

1. **SSO (Phase 1.5):** Entra ID + Google via Supabase; add `sso_connection`; test with a Brooks Stevens M365 account. (WorkOS later.)
2. **Proposals (Phase 2A-1):** proposals module + e-sign integration; on acceptance, auto-create a *draft* project.
3. **Plans (Phase 2A-2):** plan/plan_item model; generate phases + budgets from a plan; capacity/allocation view; Monday.com sync.
4. **Predictive time (Phase 2A-3):** pre-fill timesheets from allocations; plan-vs-actual variance.
5. **Meeting intelligence (Phase 2B):** inbound email → AI extraction → suggestion inbox → confirm into time/proposals/plans. Ship behind an opt-in flag.

Each is its own milestone: restate acceptance criteria → tests first → implement to green → preview + verify → follow CLAUDE.md. I can write the exact paste-in prompts for these when you reach them.

---

## E. Open questions to firm up later
1. Which meeting notetaker(s) does the team use today? (Confirms the email format to parse first; a specific one may have a clean API worth using in Phase 2B.)
2. Is Monday.com the standing PM tool for the studio/firm, or will projects live in the app itself? (Sets how deep the PM sync goes.)
3. E-signature preference — DocuSign vs Dropbox Sign (cost vs. familiarity)?
4. For meeting notes: firm-wide capture, or opt-in per person to start? (Recommend opt-in.)
