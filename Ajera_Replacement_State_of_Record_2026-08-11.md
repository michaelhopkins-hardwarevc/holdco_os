> **SUPERSEDED IN PART. Read `Ajera_Replacement_State_of_Record_Rev2_Dating.md` alongside this.**
> Rev 2 dates every decision and number below, and corrects five items. Two are material:
> (1) the Xero conversion date was revised on the evening of 10 Aug 2026 from 1 Aug 2026 / 7-31 opening
> balances to **1 Jan 2025**, with all of 2025 and 2026-to-date rebuilt in Xero. Section 2.5 D-47 below is stale.
> (2) The Xero import package is NOT missing. It is at `Documents\Ajera Reports\DATA\Xero Import`, 31 files,
> two generations. Section 4.3 below is resolved. Also: Ajera was suspended by Deltek over renewal on
> Friday 31 July 2026, so the retention clock is already running.

# Ajera Replacement: State of Record

**Compiled 11 August 2026. Michael Hopkins / Brooks Stevens Inc.**

This is the full record of the project as it stands. It covers every decision and the reasoning behind it, every live number and where it came from, every open question and what is blocking it, every artifact and its location, and the working conventions that govern how this project runs.

Provenance is marked throughout:

- **[verified 8/11]** means checked directly today against the file system, the git repository, the connected folders, or the live scheduler.
- **[memory]** means it comes from project or session memory written by an earlier session and could not be re-verified today because the source is not in a connected folder.
- **[doc]** means it comes from a delivered artifact whose text was read today.

---

## 0. What this project actually is now

It started on 1 August 2026 as "we lost Ajera, what replaces it." It is no longer that. As of today it is three separate workstreams that share a name and a folder:

1. **A data-recovery matter.** Two encrypted Deltek backups sitting on disk, unopened, with an unknown retention deadline at Deltek.
2. **An accounting cutover.** Ajera to Xero, conversion date 1 August 2026, first invoice cycle targeted for Friday 14 August 2026.
3. **A software build.** HoldCo OS, a custom multi-entity project-accounting and work-intelligence application. 54 commits, 15 database migrations, 35 test files, deployed on Vercel and Supabase.

The scope expanded twice. Understanding both expansions is the single most important thing for anyone picking this up cold.

**Expansion one (1 August).** The original deliverable was "pick a replacement product." The recommendation was BQE Core. Within the same day the question changed to "should I build the whole back office instead," and the answer was a full product specification for HoldCo OS. The BQE Core recommendation was never formally retired but it is dead. Nothing has been bought.

**Expansion two (8 August).** The project-accounting build ran into the fact that Ajera was also the accounting system, and the accounting had to move now, not in eight weeks. Xero was selected and a dated one-week cutover was scheduled. Simultaneously the time-tracking half was reframed from "replace the timesheet" to "reconstruct time from work signal," which became the Work Intelligence System, which became milestones M0 through M4 inside the HoldCo OS repository.

**The folder is also the repository.** `OneDrive - Brooks Stevens Inc\Projects\Projects\Ajera` is simultaneously the Cowork project folder and the git working tree for HoldCo OS. Planning documents and application source live side by side. This is worth knowing before anyone reorganizes it. [verified 8/11]

---

## 1. Timeline

| Date | Event |
|---|---|
| 31 Jul 2026 | Deltek delivers two backup files via ServiceNow ticket SCTASK0525853, timestamped 12:42:45 (DB) and 12:43:04 (FS) |
| 1 Aug 2026 | Backup files analyzed at byte level. Migration plan and interim workbook delivered. HoldCo OS product spec and CLAUDE.md written. Repository scaffolded, schema built, auth and RLS built (commits `f6caa83` through `2e83b65`) |
| 1 Aug 2026 | Production dashboard 500 diagnosed and fixed (`015902a`) |
| 2 Aug 2026 | §7.2 Setup, §7.3 Time entry, §7.4 Expenses, §7.5 Invoicing, Signals foundation, Outlook connector, password reset |
| 2 Aug 2026 | HoldCo OS blueprint delivered in Cowork: 12-record master-data spine, operations playbook with 29 activities on a Step/Stretch/Leap ladder, system chart, Phase 1 build plan [memory] |
| 3 Aug 2026 | §7.6 Reporting, §7.7 Import/export, Signals consistency nudge, Marmik dark reskin. `main` stops here |
| 8 Aug 2026 | Xero selected over QuickBooks Online. WIS design delivered (four parallel research agents). Xero cutover runbook delivered. Xero import package built from the Ajera Reports/DATA export. WIS M0 crosswalks built |
| 9 Aug 2026 | WIS M1 Capture. Live wiring, HubSpot and Monday adapters, cron route. Integration write-back posture recorded. Session Startup Card written |
| 10 Aug 2026 | WIS M2 Draft (clustering, boundary rule, hours). WIS M4 Xero draft-invoice export and OAuth connect flow, plus three scope fixes. Daily Founder Value Log run creates `Brooks Output Log.csv` |
| 11 Aug 2026 | Today. Working tree clean, no commits since 10 Aug |
| **14 Aug 2026** | **Target: first time-and-invoice cycle runs on Xero** |

---

## 2. Decisions and the reasoning

### 2.1 The Deltek backups

**D-01. Do not attempt to decrypt or reverse-engineer the backup files.** [doc]

Three findings established the format. Each file opens with an ASCII magic signature `MSSQLBAK` (hex `4D 53 53 51 4C 42 41 4B`) followed by version fields, not the `TAPE` Microsoft Tape Format descriptor that opens a native SQL Server backup. A full scan found zero occurrences of the standard MTF descriptor blocks (`TAPE`, `MSCI`, `MSDA`, `SSET`) that every native `.BAK` contains. Entropy measured in 4 MB windows across both files runs 7.92 to 7.99 bits per byte against a maximum of 8.0, which is statistically indistinguishable from random data. String analysis found no business terms and effectively no UTF-16 text anywhere in either payload.

Reasoning: this is Ajera's proprietary encrypted container, restorable only through `AjeraServerAdministration.exe` on an installed Ajera server. Deltek's own documentation directs hosted customers to Support for restore. Reverse-engineering a sealed format holding financial records is neither reliable nor appropriate.

**D-02. Recover history through Deltek Support, not through a technical workaround.** [doc]

Three routes were laid out. Route A is Deltek Support: ask them to restore on their side and return either a native unencrypted `.BAK` or CSV/Excel exports of the key tables plus standard reports. Route B is self-restore on an on-prem Ajera server, which needs an installer and a temporary licence from Deltek and therefore routes back through the same conversation. Route C is a paid specialist Ajera-to-new-system migration vendor.

The specific ask for Route A was written out: project list with fees and status, employee list with rates, full time-entry detail, invoice and AR register with aging, work-in-progress, trial balance and GL detail, and income statement plus balance sheet for the last two to three fiscal years. Plus the retention deadline.

Reasoning: a native unencrypted backup is the only artifact that permits full schema mapping and clean extraction. How the request is phrased determines whether the result is usable.

**D-03. Recovery does not block operations.** [doc] The interim workbook and the platform selection both proceed in parallel.

### 2.2 The replacement system

**D-04. BQE Core recommended as primary, QuickBooks Online plus Monograph as the lighter alternative. SUPERSEDED.** [doc]

Reasoning at the time: Ajera was the entire back office across four layers (time and project, billing and AR, accounting and GL, financials and payroll). BQE Core is purpose-built for design and A&E firms, covers all four with the Accounting module, and scales 1 to 40 without a second migration. Unanet A/E was noted for higher or multi-entity scale. Monograph alone was rejected for lacking a GL. Returning to the Ajera line was rejected because Deltek is steering customers to the costlier Vantagepoint.

Status: superseded by D-05 and D-19. Nothing was ever purchased. The comparison table survives in the migration plan and is still the best written summary of the market if the build stalls.

**D-05. Build the differentiated layer, integrate the commodity layer.** [doc, memory]

The strategic decision that redefined the project. General ledger, payroll, banking, e-signature, cap-table math and securities/tax reporting are solved and regulated, so they get connected, not rebuilt. The holding-company and venture-studio operating layer on top gets built, because nothing off the shelf models it.

Reasoning stated in the spec: rebuilding a GL is the single most common way custom back-office projects fail. Reasoning stated by Michael: the durable, potentially productizable value lives in the layer that spans Brooks Stevens, STS, Vault, Marmik, the studio and the roll-up. Ajera covered only the professional-services slice.

**D-06. Productization is deliberately undecided.** [memory] The endgame is "not sure yet." The architecture must not foreclose a product without paying for productization now. Concretely: an `organization` boundary exists in the schema from day one, single-org until there is a reason.

### 2.3 The software: architecture and stack

Fixed in `CLAUDE.md`, which the spec declares is law for the build. Substitution requires explicit approval. [verified 8/11]

**D-07. Stack.** TypeScript strict, Next.js 15 App Router, React 19, Tailwind CSS v4, shadcn/ui, PostgreSQL on Supabase, Drizzle ORM with migrations only, Supabase Auth with row-level security, Vitest for unit and Playwright for end-to-end, Vercel for the app, Supabase for data, Resend for email, Sentry for errors.

Reasoning: one language front to back, excellent Claude Code support, managed services with dashboards a non-engineer can operate, and boring well-documented technology so a non-specialist owner can maintain it.

**D-08. Next.js pinned to 15, not 16.** [doc] `create-next-app@latest` now installs 16, but the spec fixes the stack at 15, so the scaffold used `create-next-app@15` to keep the framework and all its config internally consistent. Revisit only on owner approval.

**D-09. Production builds use the stable webpack builder, not Turbopack.** [doc] Turbopack production builds are beta in 15.5. Dev server still uses Turbopack for speed.

**D-10. Modular monolith, not microservices.** [doc] One Next.js app in feature modules. The complexity of services is not warranted at this scale.

**D-11. Multi-entity from line one.** [doc] Two scoping columns on almost every table: `organization_id` for the future multi-tenant boundary and `entity_id` for the legal entity. There is no "the company." `entity_id` was also pushed onto child tables (contact, phase, invoice_line, payment, rate_override) beyond what the spec listed, so every RLS policy can scope uniformly without a join.

**D-12. RLS is enforced on reads via a role switch, not the service role.** [doc] The app connects as `postgres`, which bypasses RLS. `runWithUser()` opens a transaction, runs `set local role authenticated`, and sets `request.jwt.claims.sub` so `auth.uid()` resolves and every read on that transaction is filtered by SELECT policies. Verified against real Supabase at the time.

Corollary: read scoping is enforced by RLS, write authorization is enforced in the action layer via `assertEntityRole()`. Two different mechanisms, deliberately.

**D-13. Default-deny RLS from the schema milestone.** [doc] Every table gets `ENABLE ROW LEVEL SECURITY` with no permissive policies at first. Membership-based grants arrive with auth.

**D-14. Money as integer cents, hours and percentages as `numeric`.** [doc] Never floating point. Rates are cents per hour. Round only at display. Guard divide-by-zero in every ratio.

**D-15. Tests run against PGlite, not Supabase.** [doc] `@electric-sql/pglite` is real Postgres compiled to WASM running in process. Tests apply the generated migrations and load the seed against it, so "migrations apply cleanly" is proven with zero external setup and no secrets. The RLS tests go further and create the `anon`/`authenticated`/`service_role` roles and an `auth.uid()` that reads the JWT claim, emulating Supabase locally.

**D-16. `audit_log` created with the schema, not later.** [doc] It is not in the spec's §6.1 to §6.4 table lists, but CLAUDE.md requires an audit trail before any financial write, so the table was laid down early to avoid a painful later migration. No rows written until the mutating features existed.

**D-17. The invoiced-immutability trigger was deferred to the invoicing milestone.** [doc] The protection only bites once invoicing exists. It landed as migration `0008_invoiced_time_guard.sql`.

**D-18. Double-billing is blocked two ways.** [doc] First, `generateDraftInvoice` only pulls time with `status='approved'` and `invoice_id IS NULL`, then flips it to `invoiced` and links the invoice, so the same records can never be pulled twice. Second, a database trigger rejects any UPDATE that changes billing fields on an already-invoiced row. Voiding still works because it sets status back to `approved` first.

**D-19. Time and expense invoice lines are derived, never editable.** [doc] Only `manual` and `fixed` lines can be edited or removed on a draft. To change billed time you void and regenerate. This keeps every invoice reconcilable to its underlying records at all times.

**D-20. WIP and AR are computed on read, not stored.** [doc] No denormalized balances to drift.

**D-21. Reconciliation tests are the anchor for every money milestone.** [doc] `invoicing-db.test.ts` proves invoice total equals sum of lines equals sum of invoiced time plus billable expenses, that WIP drops to zero when everything is invoiced and returns on void, and that AR aging plus payments tie out. `reports-db.test.ts` proves the firm dashboard equals raw sums from `time_entry`, that per-phase profitability sums to the project total, that per-resource utilization sums to firm totals, and that per-project WIP equals the labor leg of `computeWip`.

**D-22. Actuals count all logged time at any status; WIP is the narrower slice.** [doc] Profitability and utilization count every non-deleted time entry from draft through invoiced so the numbers reflect real logged work. WIP is only approved, billable, not yet invoiced.

**D-23. Profitability is labor-based.** [doc] Billable value, cost and margin come from time only. Expenses are pass-through at cost plus markup and are not margin drivers.

**D-24. `pdf-lib` for the branded invoice PDF, not a headless browser.** [doc] Pure JavaScript with no native binaries, so it runs unchanged on Vercel serverless with no extra buildpack. PDFs go to a private Storage bucket served via short-lived signed URLs.

**D-25. The workbook importer detects the header row rather than assuming a position.** [doc] The interim workbook carries two title and instruction rows above the real header. Normalization keeps `$`, `%` and `#` as words so "Billable?" and "Billable $" do not collide.

**D-26. Import is a validation report, not all-or-nothing.** [doc] Each importer returns imported, updated, skipped and errors. A bad row is skipped with a plain reason and does not block the rest.

**D-27. Import is idempotent by natural key, except time.** [doc] Employees by name, projects by code, clients by name, indirect codes by code, all matched and updated in place. Time entries have no natural key so they append, which means a period must only be imported once.

**D-28. Imported historical time lands as `approved`.** [doc] Historical time is finished work. Amounts are recomputed from hours times rate rather than trusting the sheet's own Billable $ and Cost $ columns.

**D-29. The Marmik reskin is dark-only and token-driven.** [doc] `globals.css` replaces the shadcn light/dark blocks with the Marmik palette (carbon, graphite, steel, line, acid, cyan, blaze, bone, alum) exposed as Tailwind colors so screens compose without inline styles. Fonts are Space Grotesk for display, Inter for body, JetBrains Mono for technical. Primitives were restyled once, which reskinned every existing screen with no per-screen work.

### 2.4 The Work Intelligence System

**D-30. Build WIS inside the HoldCo OS repository, do not fork a greenfield repo.** [doc]

The WIS Day-One plan assumed a new repository. It was built into HoldCo OS instead because that repository already shipped the overlapping half: `resource` is the plan's `person`, `signal_rule` is its `correction_rule`, `resource.billRate` and `rate_override` are its `rate`, plus `invoice_line`, a Signals confirm loop and an Outlook connector. Rebuilding those was waste. Vocabulary maps as `person` to `resource`, `party` to `client`.

Consequence: M0 collapsed from "scaffold" to three crosswalk tables plus a resolver, because the app was already scaffolded and deployed.

**D-31. The crosswalk resolver is strongest-first with confidence on every match.** [doc] Monday board id or HubSpot deal id resolves to a project at High confidence. Exact SharePoint folder resolves to a project at High, a sub-folder prefix at Med. With no project, it reaches a client via email domain at Med or name variant at Low. Person is resolved independently of the charge. No match yields `matchedBy: "none"` and goes to the queue.

**D-32. Signal hardness rules.** [doc] Sent email is hard because it is a delivery timestamp. A Monday status change is hard, a plain update or comment is soft. A HubSpot note, call, email or meeting is hard; a task is soft.

**D-33. Actor and counterparty are resolved separately, per source.** [doc] The actor comes from the connection owner's Entra id (Graph), the log's `creator_id` (Monday), or the engagement `ownerId` (HubSpot). The counterparty comes from the email recipient domain skipping internal domains, the Monday board, or the HubSpot deal.

**D-34. Capture is idempotent by `(entity, source_system, source_event_id)`.** [doc] Re-syncs refresh resolution in place rather than duplicating.

**D-35. M1 was built and tested against fixtures with live tokens deferred.** [doc] Explicitly recorded as the operator's sequencing choice. Pipeline plus all three adapters first, connector authorization later. Tokens are now set (see §3.4).

**D-36. M1 was additive, not a rewrite.** [doc] The shipping calendar-to-signal path was left untouched and `activity_event` added alongside. Unifying everything through it was deferred to M2. Rationale: keep the working Signals feature stable and the diff small.

**D-37. Integration write-back posture, recorded 9 August as a deliberate boundary.** [doc]

Today every integration is read-only except Xero, which writes draft invoices only. Writing back to Monday and HubSpot is intentionally deferred past M4, not because it is hard but because governance is the gate. Under the one-home-per-fact principle, HubSpot masters customers, Monday masters projects, Xero masters money, and the app masters time and effort. The app may author only what it is master of. Everything outward-facing is a proposal or draft a human approves, never a silent overwrite. This also prevents sync loops where the app auto-writes a value it then re-captures as signal.

It is cheap to add later because every integration sits behind an adapter interface and the app never imports a vendor SDK outside its adapter, and because external records are referenced by their own id (`crosswalk_*`, `activity_event.source_event_id`).

**D-38. Buy the capture layer, build the judgment layers.** [memory] Capture is bought or already owned (Timely for auto-timesheets, Reclaim.ai for focus, Fireflies for meetings, plus the free Microsoft Graph work graph). Fuse, Infer, Match and Present are built on HoldCo OS, because no product on the market encodes Michael's definitions of value and stall.

**D-39. Noise is not waste. The "wasted time" frame is retired.** [memory, doc] Inefficiency and context switching are part of real work and reflect team maturity and trust. Every hour is attributed to the nearest project, category or initiative, including the messy ones. Residual noise is used only to surface improvement opportunities and reassignment by strength, cost and value, never as a discipline metric. This was an explicit correction from Michael to an earlier version.

**D-40. The boundary rule for vague timestamps.** [memory] The next body of work defines the end of the previous one. A later meeting or activity marks where focus shifted; a sent email is a timestamp of something delivered.

**D-41. Trust-first, self-first rollout with a published "what is NOT tracked" contract.** [memory] Three scenarios were designed (Assisted, Integrated, Autonomous) with a 90-day path. Recommended: start Assisted, cheap, prove it on himself; earn Integrated; reach Autonomous when the roll-up funds an ops role.

### 2.5 Accounting: the Xero cutover

**D-42. Xero over QuickBooks Online, decided 8 August on cost versus functionality.** [memory] Both clear the auto-connect bar, unlike Ajera. Xero is API-first with a real app marketplace and HubSpot connectors, though the native HubSpot app is limited and deeper joins need Make, n8n or custom API work.

**D-43. Retire the earlier "connect Ajera read-only" recommendation.** [memory] The WIS design originally called the Ajera read-only connection the load-bearing accuracy gap. Ajera is being retired, so that recommendation was struck and the design corrected.

**D-44. Tool-selection principle for any future purchase.** [memory] It must integrate as automatically connected to the work as possible, minimize added work, and MEASURE the work rather than BE the work. API and webhook first, no double entry, stays a feed into HoldCo OS. Four questions decide it: does it read the work through an API rather than a form, does it push and pull with existing tools so a fact entered once appears everywhere, does it produce the actuals the value math needs without re-keying, and does it stay a feed rather than a place the team has to live in.

**D-45. Split the sources of truth: the books measure money, the work measures time.** [memory] Financial actuals (revenue, cost, payroll) come from Xero via API. Time and effort actuals come from WIS confirmed activity, not a timesheet system.

**D-46. Master data routing, going forward.** [doc, memory]

| Record | Master | Migration note |
|---|---|---|
| Customers and contacts | HubSpot | Reconcile Ajera customers into HubSpot, then sync HubSpot to Xero |
| Chart of accounts, GL, AR, AP, invoices, payments, bank | Xero | The financial system of record. This is what gets loaded |
| Projects, phases, budgets, status | Monday | Mirror project as a Xero tracking category for profit-by-project |
| Time and effort | The activity layer (WIS) | Replaces Ajera timesheets. Ajera time history is archive only |
| Rates | HoldCo OS rate card, plus Xero items for invoicing | Set services and rates in Xero for invoice line items |

**D-47. Convert as of 1 August 2026 with opening balances as of the close of 31 July.** [doc] Every dollar of August activity is then recorded natively in Xero with no split month. Bring one set of opening balances plus the open items, not years of detail.

**D-48. Migrate the minimum to operate. Ajera becomes a read-only archive.** [doc]

- Friday-critical: chart of accounts, opening trial balance as of 31 July, open AR, services and rates, invoice branding, tax rates.
- Soon after (week 2): open AP, bank feed and opening cash reconciliation, customers reconciled into HubSpot then synced to Xero.
- Optional (week 2 to 3): January to July 2026 monthly summary journals so year-to-date reports work inside Xero.
- Archive only, not migrated: all prior-year detail and full transaction history. Export to Excel and PDF, store read-only.

Open AR is the one piece that cannot be skipped, so collections continue in the new system and nothing is stranded in a dying tool.

**D-49. Do-it-yourself conversion this week, specialist service only if in-Xero history proves necessary.** [doc] Route 1 is Xero's Conversion Toolbox for the chart and opening balances plus CSV or API for open invoices. Route 2 is a Deltek-to-Xero migration service (MoveMyLedger, eCloud Experts were named). Most firms keep the old system as the archive and never miss the detail.

**D-50. Xero writes draft invoices only. A human approves and sends inside Xero.** [verified 8/11] The tracking category whose options are the projects defaults to `Project`.

**D-51. Xero OAuth connect flow replaces the manual token.** [verified 8/11] Committed 10 August, followed by three scope fixes: surface missing client env as a readable error rather than a 500, encode the scope with `%20` rather than `+` to fix `invalid_scope` at authorize, and request `accounting.invoices` rather than `accounting.transactions`.

**D-52. `crosswalk_project` carries `xero_tracking_option`. The existing `invoice.qbo_id` column was left in place, not replaced.** [doc] The Xero export field and adapter landed in M4 alongside it. QuickBooks remains scaffolded for a possible Phase 2.

### 2.6 The value and delegation model

**D-53. Track outputs, not time blocks.** [memory] The unit is projects, topics and outputs, with duration and value attached, not hours of the day. AI-assisted work is not its own category; Claude is a tool and its outputs are logged under the relevant project.

**D-54. Two dollar values on every output.** [memory] Personal earning value is what the right role would be paid for the work, so doing work below his level becomes visible. Business value is the gross impact on the firm.

**D-55. The v3 model was rejected as too heavy on sales commission and too light on company-building.** [memory] Michael's correction: the model has to properly weight leadership, strategy, IP, systems, brand, key hires and the roll-up.

**D-56. The v4 model, settled.** [memory] Every activity gets an ownership tier. Founder/Executive and senior Delivery are KEEP. BD execution, Coordination and Admin are DELEGATE. Personal is neither. Founder work is valued on enterprise value (enabled profit times a multiple, default 4x; fallbacks are strategic score to dollar bands, a $750/hr founder rate, or an upside range). BD and Delivery are valued on transactional pipeline from HubSpot.

**D-57. The headline of the tracker is the arbitrage, not the timesheet.** [memory] Founder-time share, enterprise value built per founder hour, delegatable hours and the base cost to cover them, and the pipeline a BD hire would own. The point is to justify hiring an admin and a BD and reinvest his own time in company-building.

---

## 3. Live numbers and where they came from

### 3.1 The backup files [verified 8/11, sizes checked on disk]

| Item | Value | Source |
|---|---|---|
| DB backup file | `D005783_7773_CID16543_SCTASK0525853_DB__2026-07-31_124245.BAK` | On disk |
| DB size | 153,838,080 bytes (154 MB) | `ls` today |
| DB MD5 | `a901b883…6c46` (verified intact after transfer) | Migration plan appendix |
| FS backup file | `FS005783_7773_CID16543_SCTASK0525853_DB__2026-07-31_124304.BAK` | On disk |
| FS size | 570,160,640 bytes (570 MB) | `ls` today |
| Magic bytes | `MSSQLBAK` = hex `4D 53 53 51 4C 42 41 4B` | Byte-level analysis, 1 Aug |
| Entropy | 7.92 to 7.99 bits/byte in 4 MB windows, max 8.0 | Byte-level analysis, 1 Aug |
| MTF structures found | Zero (`TAPE`, `MSCI`, `MSDA`, `SSET`) | Byte-level analysis, 1 Aug |
| ServiceNow ticket | SCTASK0525853 | File naming |
| Backup timestamps | 2026-07-31 12:42:45 (DB), 12:43:04 (FS) | File naming |
| File mtime on disk | 31 Jul 2026 17:44 both files | `ls` today |

What each contains, per the migration plan: the DB file is the Ajera operating database (projects, phases, time, invoices, GL). The FS file is the document filestore (attachments and files).

A `bak_chunks` directory and a `_to_delete` directory sit alongside the DB file. `_to_delete` holds the temporary split chunks from the 1 August analysis and is Michael's to delete. `bak_chunks` still exists as of today. [verified 8/11]

### 3.2 The Xero import package, built 8 August [memory, could not re-verify]

Built from the Ajera Reports/DATA folder, which is **not currently connected to this session**. I could not locate the output files anywhere in the connected `Projects` tree today. Their location is unrecorded.

| Item | Count / value |
|---|---|
| Customer contacts | From HubSpot, name-reconciled to Ajera billing names |
| Open AR | 6 invoices |
| Open AP | 146 bills across 26 vendors |
| Chart of accounts | 263 accounts |
| Opening trial balance | Balanced, as of 7/31/2026 |
| Unresolved variance, AR | $10 |
| Unresolved variance, AP | approximately $586 |
| Plus | A bookkeeper notes file |

Also surfaced from the Ajera AP data: the bookkeeper is **Smrecek & Co.** and the payroll processor is **ADP**.

### 3.3 The repository [verified 8/11]

| Item | Value |
|---|---|
| Location | `OneDrive - Brooks Stevens Inc\Projects\Projects\Ajera` |
| GitHub org | `michaelhopkins-hardwarevc` (from merge commit messages) |
| Total commits on HEAD | 54 |
| Commits on `main` | 32 |
| First commit | 1 Aug 2026, `f6caa83` Scaffold |
| Latest commit | 10 Aug 2026, `c6ffb39` fix(xero): request accounting.invoices |
| Current branch | `milestone/wis-draft` |
| `main` tip | `9beb15f` (3 Aug), Marmik reskin |
| **`main` is behind HEAD by** | **22 commits** |
| Working tree | Clean, nothing uncommitted |
| Unpushed commits | None. `origin/milestone/wis-draft` is current |
| Local branches | 6 |
| Remote branches | 12 |
| Tracked files | 244 |
| Migration files | 15 (`0000` through `0014`) |
| Test files | 35 (34 Vitest, 1 Playwright) |
| App routes | 24 authenticated screens, 20 API routes |

Branch tips:

| Branch | Tip | Date |
|---|---|---|
| `main` | `9beb15f` Marmik reskin | 3 Aug |
| `milestone/wis-crosswalks` | `68a5e7b` M0 crosswalk layer | 8 Aug |
| `milestone/wis-capture` | `f29cee8` docs(env) HubSpot Service Key | 9 Aug |
| `milestone/wis-live` | `89af7cc` fix(hubspot) search + v4 associations | 9 Aug |
| `fix/hubspot-email-scope` | `3960762` drop emails, resilient activity types | 9 Aug |
| `milestone/wis-draft` (HEAD) | `c6ffb39` fix(xero) accounting.invoices | 10 Aug |

### 3.4 Configuration and connections [verified 8/11, values not printed]

15 environment keys populated in `.env.local`, 10 empty.

**Set:** all five Supabase keys (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL`); all four Microsoft keys (`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT`, `TOKEN_ENCRYPTION_KEY`); `MONDAY_API_TOKEN`; `HUBSPOT_SERVICE_KEY`; `CRON_SECRET`; `XERO_CLIENT_ID`; `XERO_CLIENT_SECRET`; `NEXT_PUBLIC_APP_URL`.

**Empty:** `RESEND_API_KEY`, `EMAIL_FROM`, all four Sentry keys, and all four QuickBooks keys except `QBO_ENVIRONMENT=sandbox`.

Microsoft 365 tenant id: `41b69350-ecfa-4b0d-9f9d-ad2af9020161`.

Vercel cron: one entry, `/api/capture/sync` on `0 6 * * *`, meaning 06:00 UTC daily, which is 1:00 am Central.

**Flag:** `NEXT_PUBLIC_APP_URL` in `.env.local` is still `http://localhost:3000`. That is correct for local work but the Vercel production environment must carry the real URL, otherwise both OAuth callbacks (Outlook and Xero) will build the wrong redirect. Worth confirming in the Vercel dashboard before Friday.

**Flag:** Resend is empty, so invite and invoice email is not wired. Sentry is empty, so there is no production error monitoring on a system about to touch live invoices.

### 3.5 Firm and model numbers [memory]

| Item | Value |
|---|---|
| Timekeepers now | 1 to 10 |
| Target headcount | approximately 40 within 2 years |
| Ryan Hahn bill rate | $225/hr, Sr. Industrial Design |
| Justin Gasal bill rate | $200/hr, Engineer 2 |
| Delegation cost rate, Admin | $40/hr |
| Delegation cost rate, Coordination | $55/hr |
| Delegation cost rate, BD | $75/hr base plus 8% commission |
| Founder rate fallback | $750/hr |
| Enterprise-value multiple, default | 4x enabled profit |
| Implied sales commission | 8% |

Most recent daily log run, Monday 10 August 2026 [memory]:

- 5.25 hours logged (0.5h overlap between the Plow review and the Ryan 1:1)
- Founder tier 2.0h, 38% of the day
- Senior delivery 1.0h
- Delegatable 2.25h (BD 1.5, coordination 0.5, admin 0.25) at roughly $150/day base to cover
- Obsidian: $80K pipeline advanced, open, presentation stage, implied 8% commission $6,400 if won
- LeMans Plow Phase 0: $20K billed, closed-won 6 August, realized
- Enterprise value built: approximately $75K, three score-2 band estimates (NXT LVL AI service line, Ryan 1:1 leadership, Kulik studio-tour brand/network), all editable and pending Michael's confirmation
- NXT LVL PWR (Tim and Matt Appleton) AI sales and support agent has no HubSpot deal yet

### 3.6 The interim workbook, as it stands today [verified 8/11]

Ten tabs: Start Here, Dashboard, Time Entry, Projects, Employees, Indirect Codes, Project Summary, Utilization, Invoices, Lists. Time Entry has 1,000 formula-prefilled rows; Invoices has 200; Projects 60; Employees 40.

**It was never populated with real data.** The only rows present are the delivered sample rows: employee "Jane Designer" at $145 bill / $68 cost / 0.75 target, project 25-014 "Handlebar Control Module Redesign" for "Acme Powersports" at $85,000, and one invoice INV-1001 for $900 in Draft. Everything else is empty formulas.

Conclusion: the bridge workbook was delivered on 1 August but the firm never operated on it. It remains useful only as the schema the CSV importer was built and tested against. A lock file `~$Brooks_Stevens_Interim_Time_Billing_Workbook.xlsx` is still present, meaning it was left open in Excel at some point.

### 3.7 Scheduled tasks currently live [verified 8/11 against the scheduler]

| Name | Schedule | Next run | Trigger id |
|---|---|---|---|
| Daily output & impact capture (weekdays) | `0 22 * * 1-5` (5:00 pm Central) | 11 Aug 2026 22:01 UTC | `trig_01GG1yy2hubU42i9kxsMcLK8` |
| Weekly output & impact roll-up (Monday) | `0 13 * * 1` (8:00 am Central) | 17 Aug 2026 13:03 UTC | `trig_017RV2UuvLxneHhhpd82yXmR` |

Both enabled, both created 8 August. They append to `Brooks Output Log.csv` in Google Drive root, file id `16b2gzc3cAf8jX16askb9viMEWXS4u6nx`, created 10 August with the v4 header. [memory]

Also live but adjacent, not part of this project: two J.W. Speaker one-shots (chase Lucas 21 Aug, hard checkpoint 8 Sep).

---

## 4. Open questions and what is blocking each

Ordered by how much damage the answer prevents.

### 4.1 What is Deltek's data-retention deadline? BLOCKING everything about history.

Nobody has asked. The migration plan flagged this as the highest-priority risk on 1 August and there is no record of a response, or of the request being sent. Hosted vendors purge former-customer data on a schedule. Every recovery route in §2.1 expires when that window closes, and the two files on disk are useless without Deltek.

**Blocked by:** nothing. This is a one-email action that has been open for ten days.

### 4.2 Was the Deltek export request ever made?

No record either way. The specific ask was written out in the migration plan (§3 Route A) and never confirmed as sent.

**Blocked by:** nothing.

### 4.3 Where is the Xero import package?

Built 8 August (6 open AR, 146 AP bills, 263 accounts, opening trial balance) from the "Ajera Reports/DATA" folder. That folder is not connected to this session and the output files are not anywhere in the connected `Projects` tree. If they were written to a Cowork scratch location rather than OneDrive they may be gone.

**Blocked by:** Michael confirming where they landed, or connecting that folder.

### 4.4 The two reconciling variances: AR $10 and AP approximately $586.

Open since 8 August. Small, but they sit between the Ajera trial balance and the Xero opening balances, and the runbook makes the bookkeeper's sign-off on opening balances a Tuesday-critical item.

**Blocked by:** Smrecek & Co. review.

### 4.5 Did the Xero cutover actually happen on schedule?

The runbook laid out day-by-day tasks from Saturday 8 August through Friday 14 August. Verified completions: the Xero import package exists (Monday/Tuesday work) and the Xero OAuth connect flow plus draft-invoice export are built and debugged in the app (Thursday work, done early). Not verified: the Xero organization and subscription, org settings and Wisconsin tax rates, the actual Conversion Toolbox load, customer import, the bookkeeper's balance review, and Wednesday's time-confirmation pass.

**Today is Tuesday 11 August. Friday is in three days.** The runbook's Tuesday items are due today.

**Blocked by:** nothing technical. This is execution status only Michael has.

### 4.6 Wisconsin sales-and-use tax rates in Xero.

Called out in the runbook as needing to be set before the first invoice, with a note that a sales-and-use-tax item was on his calendar this month.

**Blocked by:** the Xero org existing.

### 4.7 Payroll: in-system or dedicated provider?

Raised on 1 August in the migration plan as a decision point and never closed. It affects tool choice and cost. ADP surfaced from the Ajera AP data as the current processor, which is probably the de facto answer, but the runbook says explicitly "do not try to stand up payroll in Xero this week."

**Blocked by:** a decision. The default (keep ADP feeding the GL) is almost certainly right and just needs to be declared.

### 4.8 Which facts is HoldCo OS allowed to author versus only propose?

Recorded 9 August as the open decision that must be settled before any outward-facing write is coded. Field by field, per integration. Explicitly called a business call, not an engineering one.

**Blocked by:** Michael. Not urgent until write-back is scheduled, which is post-M4.

### 4.9 Should `main` be brought current?

`main` sits 22 commits and 7 days behind the working branch. Everything since the Marmik reskin, meaning the entire Work Intelligence System (M0 crosswalks, M1 capture, M2 draft, M4 Xero export and OAuth), lives only on `milestone/wis-draft`.

If Vercel production deploys from `main`, then none of the WIS work is live and the Xero connect flow cannot be exercised in production before Friday. If it deploys from the working branch, the branch naming is now misleading. Either way this needs resolving before the cutover leans on it.

**Blocked by:** confirming the Vercel production branch. One dashboard check.

### 4.10 What happened to `fix/hubspot-email-scope`?

A branch tip from 9 August, "drop emails (scope-gated) + make activity types resilient," that does not appear in the HEAD history. Either the fix was superseded by `89af7cc` on `milestone/wis-live` or it is an unmerged fix that is silently missing. HubSpot email capture is a hard signal under D-32, so if it was dropped for scope reasons the capture layer is thinner than the design assumes.

**Blocked by:** nothing. Needs a diff.

### 4.11 What is the migration path from M4 to production time entry?

M0 through M2 and M4 are built. M3 is not visible in the commit history. The WIS plan described M0 to M4 in roughly two to three weeks and the milestone sequence is capture, draft, confirm, export. Whether "confirm" (M3) exists under another name or is genuinely missing is unclear from the log.

**Blocked by:** nothing. Needs a check of the milestone definitions against what shipped.

### 4.12 Is the Phase 1 application actually being used, or was it overtaken?

§7.1 through §7.7 all shipped between 1 and 3 August: entities, users, roles, clients, projects, time entry, expenses, invoicing with WIP and AR, reporting, import and export. That is a complete Ajera replacement on paper. Then on 8 August the accounting moved to Xero instead, and the app's role narrowed to capturing time and pushing draft invoices.

Nothing records whether anyone at Brooks Stevens has entered a timesheet in it. The interim workbook was never used (§3.6), so the fallback was not used either.

**Blocked by:** Michael. This determines whether §7.5 invoicing is dead code or the Friday plan B.

### 4.13 Missing brand assets.

The real Marmik `logo.svg` and eight icon SVGs were not in the handoff bundle (they were referenced through an external design-system module). Navigation currently uses text labels and a tick marker, and the logo is a placeholder reticle. Dropping `public/brand/logo.svg` and `public/brand/icons/*.svg` in upgrades it with no code change.

**Blocked by:** the asset files.

### 4.14 Sentry and Resend are unconfigured.

No production error monitoring and no transactional email on a system about to write invoices. Both are in the spec's stack.

**Blocked by:** two free account signups.

### 4.15 STS Technical Design.

The spec's Phase 1 success criterion is "Brooks Stevens **and** STS run all time, billing, and project profitability here." STS is a pending acquisition. Nothing in the record since 1 August mentions it. If the acquisition slipped, the multi-entity requirement that drove a large part of the architecture (RLS, entity switcher, `entity_id` on every table) is currently serving one entity.

**Blocked by:** deal status.

---

## 5. Artifacts and where they live

### 5.1 In the Ajera project folder [verified 8/11]

`C:\Users\michael.hopkins\OneDrive - Brooks Stevens Inc\Projects\Projects\Ajera\`

| File | Size | What it is |
|---|---|---|
| `Replacing_Ajera_Migration_Plan.docx` | 19.8 KB | The 1 Aug assessment: backup forensics, three recovery routes, the four layers Ajera covered, the platform comparison table, the five-phase roadmap, risks, and the technical appendix |
| `Brooks_Stevens_Interim_Time_Billing_Workbook.xlsx` | 137 KB | The bridge workbook. Ten tabs. Never populated |
| `HoldCo_OS_Product_Spec.md` | 25 KB | v1.0, 1 Aug. Vision, principles, build-versus-integrate table, five-phase roadmap, stack, full data model, Phase 1 acceptance criteria, integrations spec, non-functional and security requirements, operator guide, glossary |
| `HoldCo_OS_Spec_Addendum_Intake_Intelligence.md` | 12 KB | The identity and intake layer: agnostic SSO, notetaker integration, proposals that auto-create projects, plans that seed phases and budgets |
| `CLAUDE.md` | 4.8 KB | Engineering guardrails. Prime directives, fixed stack, definition of done, data and security rules, workflow rules, explicit non-goals |
| `00_START_HERE_Claude_Code_First_Session.md` | 4.6 KB | Prompts 1 to 3, copy-paste ready |
| `Phase1_Remaining_Prompts_4-9.md` | 6.2 KB | Prompts 4 to 9, covering §7.2 through §7.7 |
| `README.md` | 9.2 KB | Setup, including the non-technical account-creation walkthrough and the full Azure app-registration steps for Outlook |
| `docs/DECISIONS.md` | 23 KB | The engineering decision log, newest first. The primary source for §2.3 and §2.4 above |
| `.env.example` | 4.3 KB | Every key with inline explanation of where to get it |
| `src/`, `e2e/`, `scripts/`, migrations | | The application |

### 5.2 Cowork artifacts [verified 8/11]

`...\Projects\Artifacts\` holds 32 items. Directly relevant:

- `xero-cutover-runbook/` — the dated 8 to 14 August runbook. index.html, 18 KB
- `work-intelligence-system/` — the full WIS design. index.html, 32 KB
- `brooks-stevens-operating-system/`, `brooks-stevens-system-chart/`, `brooks-stevens-operations-playbook/` — the 2 August blueprint set
- `weekly-timesheet/` — the v1 time-based timesheet, superseded by the output model

**Backup gap, flagged in the Session Startup Card:** all 32 artifacts exist only as Cowork artifacts. They are not backed up and vanish with a reset. Copy them into OneDrive periodically.

### 5.3 Google Drive [memory]

- `Brooks Output Log.csv`, root, id `16b2gzc3cAf8jX16askb9viMEWXS4u6nx`, owner michael.hopkins@brooksstevens.com. Created 10 Aug with the v4 header, 8 rows appended for that day
- `Weekly Founder Value Log 2026-08-03`, a Google Doc from the 10 Aug scheduled weekly run
- An earlier `Brooks Timesheet Log.csv` is referenced in memory but could not be found by title, owner or full-text search

### 5.4 The backup files

- `C:\Users\michael.hopkins\D005783_7773_CID16543_SCTASK0525853_DB__2026-07-31_124245\` — the 154 MB DB backup, plus `bak_chunks\` and `_to_delete\`
- `C:\Users\michael.hopkins\FS005783_7773_CID16543_SCTASK0525853_DB__2026-07-31_124304\` — the 570 MB filestore backup

### 5.5 Related documents outside this project

- `...\Projects\_Canon\Session_Startup_Card.md` — how to start a session so it works. Read §6 below
- `...\Projects\CLAUDE.md` — the working-memory hot cache. Note this is a **different** CLAUDE.md from the engineering one inside the Ajera repo
- `...\Projects\_Knowledge\Hopkins_Knowledge_Baseline.md` — the reconciled July 2026 baseline
- Miro board `https://miro.com/app/board/uXjVHzxXEPg=/` — "Brooks Stevens: Business Workflow (Master Map)". The v1 skeleton of the end-to-end lifecycle, part of the same operating-system effort

### 5.6 Missing or unlocated

- The Xero import package output files (§4.3)
- The Ajera Reports/DATA export folder (not connected)
- Marmik `logo.svg` and the eight icon SVGs (§4.13)

---

## 6. How Michael works on this

The things that are not obvious from reading the chats, drawn from memory and from the canon documents. These are working conventions, and violating them costs real rework.

### 6.1 Writing

- **No em-dashes. Ever.** Absolute rule across all output including branded documents. Use periods, commas or parentheses.
- Voice is operator, not consultant. If it reads like a consulting deliverable, rewrite it.
- Declarative. No hedging, no consultant-speak.
- Shorter beats longer. He edits down hard.
- Specific beats abstract. Name the manufacturer, the dollar figure, the stalled program.
- Lead with client pain before firm capability.
- Internal analysis should be fully unvarnished.

### 6.2 How he directs the build

- He considers himself mostly non-technical and asked for the stack to be chosen for him. `CLAUDE.md` prime directive 2 exists because of this: explain in plain language, never make him run a cryptic command without a copy-pasteable step and a statement of what success looks like.
- He drives the build himself with Claude Code, one milestone per prompt, from the pre-written prompt files.
- He wants one milestone built at a time and nothing built ahead. This is written as prime directive 1 and it is enforced in every milestone prompt.
- He sequences deliberately and will tell you to defer things. M1's "build the adapters against fixtures, authorize the connectors later" was his call, recorded as such.
- He verifies by clicking preview URLs, not by reading code. Every milestone must end with a URL and three lines on what to click.

### 6.3 How he thinks about the problem

- He frames maturity as good / better / best, which he labels **Step / Stretch / Leap**. That is also the firm's standard three-tier proposal ladder (Essential / Recommended / Showcase).
- He anchors operations work on the Brooks Stevens core work loop: **win, mobilize, deliver, monetize, grow**.
- The stated goal is an integrated operating system of apps sharing master data, to end redundant data entry and rework. That includes existing integrations, new integrations, off-the-shelf apps, and net-new apps to fill gaps. It is not "build everything."
- He thinks at architecture level across legal, financial, operational and brand domains simultaneously, and is oriented to institutional legitimacy over short-term revenue.
- He corrects framing, not just facts. Two examples worth internalizing: he rejected the "wasted time" frame outright, and he rejected the v3 value model for over-weighting sales and under-weighting company-building. When he pushes back on a model, he is usually rejecting what it measures, not how it calculates.
- He treats BD and sales execution as delegatable. He treats founder, executive and visionary work as the scarce, high-value use of his time. The whole tracker exists to make that arbitrage visible enough to justify hiring.

### 6.4 Session and folder conventions

From `_Canon\Session_Startup_Card.md`, 9 August:

- **Reuse the project, do not create a new one.** Memory lives at project level and every chat inside a project inherits it. A new project starts from zero. Create a new project only for a different domain, never a different task.
- **Confirm the root folder is connected before asking anything substantive.** This is the expensive one. On 9 August, partial folder access produced a delivery gate model built from scratch while a finished version sat unread, a claim that no vision statement existed when one had since 2021, and six canonical goals derived without knowing five were already set. None were reasoning failures. Each was correct for what was visible, and what was visible kept changing.
- **Name the chat** `[Entity] - [Deliverable] - [vN or date]`.
- **Say what is missing** in the first message if relevant material is somewhere unconnected.
- **One broad root beats many subfolders.** `OneDrive - Brooks Stevens Inc\Projects` as a single grant covers all 22 client folders plus `_Knowledge`, `_Brand & Templates`, `_Admin`, `_Archive`, `CLAUDE.md` and `memory/`.
- **Acquisition and Marmik work stays out of Brooks Stevens shared systems.** His own confidentiality rule. Project memory is shared context, so the separation has to be structural, not remembered mid-session.
- **Work product goes to OneDrive. App state stays in CoworkData and is regenerable.** The bridge is: connected folder in, committed file out.

Known blockers, so they are not rediscovered: `C:\Users\michael.hopkins\CoworkData` cannot be shared by design. `Documents` root cannot be parent-shared because `Documents\WindowsPowerShell` is protected, so connect subfolders. `P:\B\Brooks Stevens Inc` is a network drive that lists but cannot be staged, so copy to OneDrive first. A `CLAUDE.md` in a *parent* of the connected folder does not load.

### 6.5 The maintenance rhythm he wants

- **Continuous:** session memory writes itself, nothing required.
- **Weekly, ten minutes:** promote standing facts from session memory into canon. Noted as "the tier that has never existed."
- **Monthly, thirty minutes:** reconcile stores, empty the inbox, archive superseded work, rebuild the context skill.

Principle: promotion, not duplication. A fact lives in one place at one altitude.

### 6.6 Known staleness in the canon

The hot-cache `CLAUDE.md` predates the Horizon Plan Rev B, the loss of Ajera, and everything from 9 August. It still carries the Sept 15 and Nov 30 shutdown gates as live. It also records the Brooks Stevens PD phases as PLAN > DISCOVER > DESIGN > DELIVER, which is superseded. The canonical process as of 9 August is **PLAN > IDEA > DESIGN > DEVELOP > LAUNCH**, five phases, five gates, sourced from the April 2026 Methodology Guideline. Also note: `CLAUDE.md` says the firm was founded 1934, and the Design Intelligence fact-check on 11 August established it is **1935** per the Milwaukee Art Museum archive.

---

## 7. What I could not verify today

Stated plainly so nobody treats this document as more solid than it is.

1. **Everything in §3.2** (the Xero import package counts) comes from memory written on 8 August. The source folder is not connected and the output files are not findable. The counts, the balanced trial balance, and both variances are unconfirmed.
2. **Whether the Xero organization exists.** `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET` are set in `.env.local`, which proves a developer app was registered at developer.xero.com. It does not prove a Xero subscription exists or that any data was loaded.
3. **Whether any connector is actually authorized.** Tokens are set in the environment. Whether Outlook, Monday, HubSpot or Xero have completed their OAuth handshakes lives in the `source_connection` and Xero store tables in Supabase, which I did not query.
4. **Whether the test suite currently passes.** I counted 35 test files. I did not run them. There is no network access to the database from this session and running the suite requires the local machine.
5. **Which branch Vercel deploys from** (§4.9), and whether the production environment variables match `.env.local`.
6. **Whether any real time has been entered into the application by anyone** (§4.12).
7. **Whether the Deltek request was sent** (§4.2) and the retention deadline (§4.1). These are the two highest-consequence unknowns in the entire record.
8. **The content of the earlier chats themselves.** This record was reconstructed from project memory, session memory, the delivered artifacts, the git history and the file system. Anything discussed in a chat and never written down is not here.

---

## 8. If you are picking this up cold, do these first

1. Email Deltek. Ask for the retention deadline and the native export. Ten days lost already, and this is the only item with a hard expiry.
2. Check which branch Vercel deploys from, and merge `milestone/wis-draft` into `main` if production runs from `main`.
3. Confirm the Xero organization is live and the opening balances are loaded. Today is the runbook's Tuesday.
4. Find the Xero import package files or rebuild them.
5. Set `NEXT_PUBLIC_APP_URL` correctly in Vercel production before exercising either OAuth callback.
6. Decide whether Friday's invoices come out of Xero manually or through the app's draft export, and stop building whichever path is not being used.
