# Ajera Replacement: State of Record, Rev 2

## Dating register and corrections to Rev 1

**Compiled 11 August 2026.** Companion to `Ajera_Replacement_State_of_Record_2026-08-11.md` (Rev 1). Read this second. It dates every decision and number in Rev 1, and it corrects five things Rev 1 got wrong or stale.

---

## 0. What I could and could not use

**I cannot read the chat transcripts.** There is no tool in this session that opens prior Cowork conversations. Rev 1 said this and it is still true. So "date it from the chat history" is not something I can do directly, and I am not going to estimate a date from a conversation I cannot see.

What I dated from instead, in descending order of reliability:

| Tier | Evidence | Precision |
|---|---|---|
| **A** | Git commit timestamps (54 commits), file modification times, the scheduler's own `created_at` records | Exact to the minute, re-verified today |
| **B** | A document that states its own date, or an artifact registry entry | Exact to the day |
| **C** | A memory line carrying an explicit date, e.g. "cowork, Aug 8 2026" | Exact to the day |
| **D** | A memory line with no date. Bounded only by the memory file's last-write time as an upper limit | A range, stated as a range |
| **E** | No date evidence at all | Marked "cannot establish" |

Every item below carries its tier. Where a date is tier D or E, I say so rather than picking a plausible day.

**A note on tier D.** Memory files are appended to over time, so a file's "updated" timestamp bounds only the most recent write to that file, not the individual line. A line in `/areas/time-tracking.md` (last written 10 Aug 17:09 CDT) could have been added on 2 August. Upper bound is all that timestamp gives.

**A discovery that changes the shape of the record.** Rev 1 was compiled from this project's memory, which holds one topic file. Today I found a much larger companion record at `_Knowledge\Brooks_Stevens_State_of_Record_2026-08-11.md` (162 KB, written today at 12:00), compiled in the **Brooks Stevens** Cowork project from 24 project-memory topic files, the connected OneDrive folders, the artifact registry, and the on-disk Xero migration kit. The Xero cutover work was executed in that project, not this one. That is why Rev 1 could not find the Xero import package. It was never lost. It was in another project's working folder, which is not connected to this session.

Where that record supplies a date or a number, it is cited below as **[BS-SOR]** and treated as tier B or C depending on what it is dating.

---

## 1. Corrections to Rev 1

Five items. The first two are material.

### C-1. The Xero conversion date was revised on the evening of 10 August. Rev 1 carries the superseded version.

**Rev 1 said (D-47):** convert as of 1 August 2026, opening balances as of the close of 31 July 2026, so August activity is native to Xero with no split month. Migrate the minimum: one set of opening balances plus open items, not years of detail.

**That was set 8 August 2026** [B, the `xero-cutover-runbook` artifact, created 2026-08-08] and it was correct as of the runbook.

**It was revised the evening of 10 August 2026** [B, BS-SOR §2.8 and §5.1; disk timestamps in the migration kit run to 10 Aug 19:18 Central]. The live decision now is:

- **Conversion date: 1 January 2025.** Basis accrual. No sales tax collected.
- Opening balances come from the reconciled **12/31/2024** trial balance.
- **All of 2025 and 2026 to date get rebuilt and reconciled inside Xero** from bank and card statement lines.

**Why it changed:** 2025 was never reconciled in Ajera. Opening balances at 7/31/2026 would therefore have been built on an unreconciled year. The stated reasoning in the runbook is that you cannot carry an unreconciled year forward into a new set of books.

**What this costs:** it is a materially bigger job than the 8 August plan. Package 2 imports 587 Chase checking lines, 49 Chase savings lines, 213 Amex card 1 lines, 147 Amex card 2 lines, plus 2025 to 2026 sales invoices and 293 vendor bills. The 8 August plan was "chart of accounts, opening trial balance, open AR, done."

**A standing recommendation was added at the same time:** do the build yourself, but get a one-time bookkeeper or CPA review of the opening balances and the reconstructed 2025 **before filing the 2025 tax return.**

**Consequence for Rev 1 §4.5.** Rev 1 asked whether the cutover happened on schedule and treated Friday 14 August as the finish line for a small job. The re-basing makes "operational on Xero by Friday" a much harder claim. The Friday target itself has not been revised on the record.

### C-2. The Xero import package is not missing. Rev 1 §4.3 is resolved.

**Rev 1 said:** built 8 August from the Ajera Reports/DATA folder, output files not findable in any connected folder, possibly lost to Cowork scratch.

**Actual location** [B, BS-SOR §4.6]: `OneDrive\Documents\Ajera Reports\DATA\Xero Import`, 31 files, still on disk. That folder is connected to the Brooks Stevens project session and is **not** connected to this one, which is the entire explanation.

Two complete generations exist in that folder:

- **Package 1**, built 8 August, based on the 7/31/2026 trial balance. 14 files plus `ajera-export-checklist.md` added 9 August.
- **Package 2**, built the evening of 10 August, based on the 12/31/2024 trial balance. 16 files. **This is the live one.**

The permanent Ajera baseline sits alongside in `DATA\`: ACTIVE PROJECTS, CLIENT INVOICES, CLIENT RECEIPTS, CLIENTS, GL ENTRY (19 MB), PROJECT ACTIVITY, VENDOR PAYMENTS, CHART OF ACCOUNTS, July 2026 TRIAL BALANCE, VENDOR AGING, VENDOR INVOICE REGISTER (16 MB), plus `ORIGINAL DATA\` with 2020 to 2024 P&Ls and Dec 2012 / 2020 / 2024 trial balances.

### C-3. Ajera was not merely "lost access." It was suspended by Deltek over renewal, on Friday 31 July 2026.

**Rev 1 said:** "Michael lost access to Ajera (hosted)."

**Actual** [C, BS-SOR D-65, tagged as stated by Michael]: lost **Friday 2026-07-31**, Deltek suspended the account over renewal. The 31 July Excel exports are the permanent historical baseline.

This is not a cosmetic difference. Rev 1 §4.1 and §4.2 treat the retention deadline as an unknown clock. The clock has already started, and access is already gone. BS-SOR §3.9 calls the remaining Ajera exports **"the highest-decay item in the entire record."** Six are still to pull and cannot be pulled: vendor master with remit-to addresses, payment terms and tax IDs; the 1099 report for 2026 YTD and 2025; WIP detail by project as of 7/31; employee list with bill and cost rates; full time and expense detail history; and the fixed asset and depreciation schedule.

### C-4. Rev 1's 10 August timeline row is wrong. WIS M2 and the M4 Xero export were both 9 August.

Corrected from commit timestamps [A]:

- **M2 Draft** ran entirely on **9 August**, from 18:16 to 21:26.
- **M4 Xero draft-invoice export** was **9 August 22:04** (`e5e5cd8`), not 10 August.
- **10 August** contains only four commits, all between 07:07 and 07:53: the Xero OAuth connect flow and three scope fixes.

Rev 1's §2 decision entries had this right for D-50; the timeline table did not.

### C-5. The two rate figures in Rev 1 §3.5 are quoted rates, not realized rates. Rev 1 blurred the basis.

**Rev 1 said:** Ryan Hahn $225/hr, Justin Gasal $200/hr, sourced from the `CLAUDE.md` hot cache, which carries no date.

**Realized rates, verified from Ajera for the 12 months to 2026-07-31** [BS-SOR §2.9]: Ryan Hahn **$224.86/hr**, Justin Gasal **$192.86/hr**, Mike Hopkins **$250/hr**. Firm average 2025 **$191/hr**, against $125 in 2020.

Not a revision. Two different measures that Rev 1 presented as one. Ryan's quoted and realized rates are effectively identical; Justin's realized rate runs $7.14 below his quoted rate.

---

## 2. Dating register: decisions

Rev 1's decision IDs. "Set" is when the decision first appears in a dated artifact. "Revised" records any later change and what it changed from.

### 2.1 The Deltek backups

| ID | Decision | Set | Tier | Revised |
|---|---|---|---|---|
| D-01 | Do not decrypt the backups | **1 Aug 2026, by 11:08 CDT** | A | No |
| D-02 | Recover through Deltek Support (Route A) | **1 Aug 2026, by 11:08 CDT** | A | Not revised, but overtaken by events: access was already suspended as of 31 Jul (C-3) |
| D-03 | Recovery does not block operations | **1 Aug 2026, by 11:08 CDT** | A | No |

All three are dated by the modification time of `Replacing_Ajera_Migration_Plan.docx`, **1 Aug 2026 11:08 CDT**. The byte-level analysis behind D-01 necessarily precedes it; the analysis start time is tier E, cannot establish.

### 2.2 The replacement system, and the pivot

This is the sequence that redefined the project, and it is tighter than anyone would guess. All tier A, from file modification times on 1 August 2026:

| Time (CDT) | Artifact | What it established |
|---|---|---|
| **11:04** | `Brooks_Stevens_Interim_Time_Billing_Workbook.xlsx` | The interim bridge (D-03's operating half) |
| **11:08** | `Replacing_Ajera_Migration_Plan.docx` | D-01, D-02, D-03, **D-04 (BQE Core)** |
| **11:26** | `HoldCo_OS_Product_Spec.md` and `CLAUDE.md` (same minute) | **D-05 (build it), D-06, D-07, D-10, D-11, D-14** |
| **11:30** | `00_START_HERE_Claude_Code_First_Session.md` | The build was already being scheduled |
| **12:12** | Commit `f6caa83`, scaffold | Code exists |
| **16:19** | `Phase1_Remaining_Prompts_4-9.md` | The rest of Phase 1 planned |

**D-04 (BQE Core primary, QBO + Monograph alternative) survived 18 minutes.** Set 11:08, superseded 11:26 by the decision to build. It was never formally retired, which is why Rev 1 had to flag it as dead-but-standing.

| ID | Decision | Set | Tier | Revised |
|---|---|---|---|---|
| D-04 | BQE Core primary | 1 Aug 11:08 | A | **Yes, twice.** Superseded 1 Aug 11:26 by D-05 for the operating layer. Superseded 8 Aug by D-42 (Xero) for the accounting layer. Revised from: BQE Core Foundations + Accounting as primary, QBO + Monograph as the lighter alternative, Unanet noted for higher scale |
| D-05 | Build differentiated, integrate commodity | 1 Aug 11:26 | A | No |
| D-06 | Productization deliberately undecided | 1 Aug 11:26 | A | No |

**An intermediate accounting decision I cannot date.** BS-SOR §5.1 records that three Brooks Stevens project-memory files still say "QuickBooks Online Essentials plus Harvest, roughly $100/mo, targeted live Aug 15." That sits between D-04 (1 Aug) and D-42 (8 Aug) and is neither of them. **When it was set: cannot establish (tier E).** It is still in that project's memory today, uncorrected, and the cash engine's Power Query is written against QBO report shapes because of it.

### 2.3 Architecture and stack

All tier A, dated by commit or by the file that fixed them.

| ID | Decision | Set | Revised |
|---|---|---|---|
| D-07 | Stack fixed (Next 15, React 19, Tailwind v4, shadcn, Supabase, Drizzle, Vitest, Playwright, Vercel, Resend, Sentry) | 1 Aug 11:26, `CLAUDE.md` | No. `package.json` last touched 2 Aug 22:43 |
| D-08 | Next.js pinned to 15, not 16 | 1 Aug 12:12, `f6caa83` | No |
| D-09 | Production builds on webpack, not Turbopack | 1 Aug 12:12, `f6caa83` | No |
| D-10 | Modular monolith | 1 Aug 11:26, spec §5.2 | No |
| D-11 | Multi-entity from line one | 1 Aug 11:26 (spec). Extended 1 Aug 13:02 (`84a1714`) to put `entity_id` on child tables beyond the spec's list | Extension only, not a reversal |
| D-12 | RLS enforced via `runWithUser()` role switch, not the service role | 1 Aug 16:10, `2e83b65` | No |
| D-13 | RLS default-deny, no policies | 1 Aug 13:02, `84a1714` | Scope changed 1 Aug 16:10 when membership grants were added. The default-deny posture held |
| D-14 | Money as integer cents | 1 Aug 11:26 (`CLAUDE.md`), implemented 13:02 | No |
| D-15 | Tests against PGlite, not Supabase | 1 Aug 13:02, `84a1714` | No |
| D-16 | `audit_log` created with the schema | 1 Aug 13:02, `84a1714` | No |
| D-17 | Invoiced-immutability trigger deferred | Deferred 1 Aug 13:02. **Landed 2 Aug 22:52** (`a535482`, migration `0008`) | Deferral closed as planned |
| D-18 | Double-billing blocked two ways | 2 Aug 22:52, `a535482` | No |
| D-19 | Time and expense invoice lines are derived, not editable | 2 Aug 22:52, `a535482` | No |
| D-20 | WIP and AR computed on read | 2 Aug 22:52, `a535482` | No |
| D-21 | Reconciliation tests anchor every money milestone | 2 Aug 22:52 (invoicing) and 2 Aug 23:15 (reports, `118920a`) | No |
| D-22 | Actuals count all logged time at any status | 2 Aug 23:15, `118920a` | No |
| D-23 | Profitability is labor-based | 2 Aug 23:15, `118920a` | No |
| D-24 | `pdf-lib`, not a headless browser | 2 Aug 22:52, `a535482` | No |
| D-25 | Importer detects the header row | 3 Aug 07:44, `cf0e31a` | No |
| D-26 | Import returns a validation report, not all-or-nothing | 3 Aug 07:44, `cf0e31a` | No |
| D-27 | Import idempotent by natural key, time appends | 3 Aug 07:44, `cf0e31a` | No |
| D-28 | Imported historical time lands `approved` | 3 Aug 07:44, `cf0e31a` | No |
| D-29 | Marmik reskin, dark-only and token-driven | 3 Aug 10:52, `9beb15f` | No |

### 2.4 The Work Intelligence System

| ID | Decision | Set | Tier | Revised |
|---|---|---|---|---|
| D-30 | Build WIS inside the HoldCo OS repo, not greenfield | **8 Aug 23:08**, `68a5e7b` | A | No |
| D-31 | Crosswalk resolver strongest-first with confidence | 8 Aug 23:08, `68a5e7b` | A | No |
| D-32 | Signal hardness rules | 9 Aug 10:43, `c1097bb` | A | Partially. `fix/hubspot-email-scope` (9 Aug 18:19) drops HubSpot emails as scope-gated. See §5 |
| D-33 | Actor and counterparty resolved separately, per source | 9 Aug 10:43, `c1097bb` | A | No |
| D-34 | Capture idempotent by `(entity, source_system, source_event_id)` | 9 Aug 10:43, `c1097bb` | A | No |
| D-35 | Build M1 against fixtures, defer live tokens | 9 Aug 10:43, `c1097bb` | A | **Yes, closed within 4 hours.** Live wiring landed 9 Aug 14:36 and 16:43. Tokens present in `.env.local` by 10 Aug 07:26 |
| D-36 | M1 additive, calendar path untouched, unification deferred to M2 | 9 Aug 10:43, `c1097bb` | A | **Yes, closed 9 Aug 21:26** by `507ecba`, "unify calendar into the activity feed" |
| D-37 | Integration write-back posture: read-only except Xero drafts | **9 Aug 10:55**, `a302b6e` | A | No |
| D-38 | Buy the capture layer, build fuse/infer/match/present | 8 Aug (artifact `work-intelligence-system`) | B | No |
| D-39 | Noise is not waste, "wasted time" framing retired | Recorded in the 8 Aug WIS artifact. **The date Michael made the correction: cannot establish (tier E).** Bounded to on or before 8 Aug | B/E | It is itself the revision. Revised from: an earlier tracker version that treated unattributed time as waste |
| D-40 | Boundary rule for vague timestamps | Stated in the 8 Aug WIS design. **Implemented 9 Aug 18:16**, `3374d0b` | B/A | No |
| D-41 | Trust-first, self-first rollout, published "not tracked" contract | 8 Aug (WIS artifact) | B | No |
| D-52 | `crosswalk_project` carries `xero_tracking_option`, `invoice.qbo_id` left in place | 8 Aug 23:08, `68a5e7b` | A | No |
| D-50 | Xero writes draft invoices only | **9 Aug 22:04**, `e5e5cd8` | A | No |
| D-51 | Xero OAuth flow replaces the manual token | **10 Aug 07:07**, `9962869`, plus fixes at 07:31, 07:46, 07:53 | A | It is itself the revision. Revised from: a manually pasted Xero token |

### 2.5 The Xero cutover

| ID | Decision | Set | Tier | Revised |
|---|---|---|---|---|
| D-42 | Xero over QuickBooks Online | **8 Aug 2026** | C | Revised from D-04 (QBO + Monograph, 1 Aug) and from an undatable intermediate (QBO Essentials + Harvest, ~$100/mo, target live 15 Aug) that is still in the Brooks Stevens project memory |
| D-43 | Retire "connect Ajera read-only" | 8 Aug 2026 | C | It is itself the revision. Revised from: the WIS design's original position that a read-only Ajera connection was the load-bearing accuracy gap |
| D-44 | Tool-selection principle: measure the work, do not be the work | 8 Aug 2026 | C | No |
| D-45 | The books measure money, the work measures time | 8 Aug 2026 | C | No |
| D-46 | Master-data routing (Xero / HubSpot / Monday / activity layer) | 8 Aug 2026, runbook artifact | B | No. Restated unchanged in BS-SOR D-68 on 11 Aug |
| D-47 | Convert as of 1 Aug 2026, opening balances at 31 Jul close | 8 Aug 2026, runbook | B | **YES. Revised evening of 10 Aug 2026 to a 1 January 2025 conversion date with 2025 and 2026-to-date rebuilt in Xero.** See C-1 |
| D-48 | Migrate the minimum, Ajera becomes a read-only archive | 8 Aug 2026, runbook | B | **Half revised.** The "minimum" half is void, because Package 2 imports two years of bank, card, invoice and bill lines. The "Ajera becomes archive" half holds |
| D-49 | DIY conversion, specialist only if in-Xero history proves necessary | 8 Aug 2026, runbook | B | Held, but the 10 Aug re-basing makes the DIY job materially larger, and a bookkeeper/CPA review of opening balances and reconstructed 2025 before the 2025 tax filing was added at the same time |

### 2.6 The value and delegation model

This cluster is the weakest-dated in the record. All of it comes from `/areas/time-tracking.md`, whose lines carry "Aug 2026" without a day, and whose last write was **10 Aug 2026 17:09 CDT** (upper bound only).

| ID | Decision | Set | Tier | Revised |
|---|---|---|---|---|
| D-53 | Track outputs, not time blocks | **Cannot establish a day.** Bounded: after the v1 timesheet, on or before 8 Aug (the WIS design assumes it) | D | It is itself a revision. Revised from: a time-of-day weekly timesheet reconstructed from Outlook calendar and sent mail |
| D-54 | Two dollar values on every output | **Cannot establish a day.** Upper bound 10 Aug | D | No |
| D-55 | v3 rejected as too heavy on BD commission, too light on company-building | **Cannot establish a day.** Bounded between v3 and v4 | D | It is itself the revision. Revised from: v3, a role-based rate card plus 8% implied sales commission, business value from HubSpot deal amounts |
| D-56 | v4 settled: ownership tiers, founder work on enterprise value | **On or before 10 Aug 2026.** The v4 header was written into `Brooks Output Log.csv` on 10 Aug, which is a hard floor | C | No. BS-SOR D-73 records it as "settled at v4 after three revisions" |
| D-57 | The headline is the arbitrage, not the timesheet | Same bound as D-56 | C | No |

The version chain is v1 → v3 → v4. **There is no record of a v2.** Whether one existed: cannot establish.

---

## 3. Dating register: numbers

### 3.1 Backup file forensics [Rev 1 §3.1]

| Number | When measured | Tier | Revised |
|---|---|---|---|
| Magic bytes, absent MTF blocks, 7.92 to 7.99 entropy, MD5 `a901b883…6c46` | **1 Aug 2026, reported by 11:08 CDT** | A | No |
| File sizes 153,838,080 and 570,160,640 bytes | Written to disk 31 Jul 2026 17:44. Re-verified 11 Aug 2026 | A | No |
| Ticket SCTASK0525853, stamps 12:42:45 and 12:43:04 | **31 Jul 2026** | A | No |

The analysis start time is tier E. Only its publication at 11:08 is dated.

### 3.2 The Xero import package [Rev 1 §3.2]

Rev 1 carried these as unverifiable memory. They are now dated and verified from disk by BS-SOR §2.8. **All Package 1 figures are as at 8 August and are superseded as the live basis.**

**Package 1, set 8 Aug 2026, basis 7/31/2026. Superseded 10 Aug evening.**

| Number | Rev 1 said | Actual [BS-SOR] |
|---|---|---|
| Trial balance, both sides | not carried | **$1,474,297.76**, balances to the penny |
| Chart of accounts | 263 | 263, mapped to Xero types |
| Open AR | 6 invoices | 6 invoices, **$49,480** subledger vs $49,490.00 per TB |
| AR variance | "$10" | **$10.00** exactly |
| Open AP | 146 bills / 26 vendors | 146 bills / 26 vendors, **$191,779.52** vs $191,193.82 per TB |
| AP variance | "approximately $586" | **$585.70** exactly |
| Retained earnings (38000) | not carried | **$611,112.68 debit**, an accumulated deficit |
| Active projects for tracking | not carried | **40** |

**Package 2, set evening of 10 Aug 2026, basis 12/31/2024. This is the live one.** None of this was in Rev 1.

| Number | Value |
|---|---|
| Conversion date | **1 January 2025**, accrual, no sales tax |
| Conversion balances, both sides | **$1,154,684.20** |
| Opening account balances | 38 accounts |
| Open AR at 12/31/2024 | **$109,487.24**, 7 unpaid invoices ($10 rounding difference against the books) |
| Open AP at 12/31/2024 | **$104,261.79**, 96 unpaid bills. Books hold $106,473, so AP is **$2,211 light** |
| Checking opening | **$617.62**, confirmed against the bank |
| Savings opening | Ajera book **-$3,524.73** vs actual Chase **~$0.77**. Unresolved |
| Retained earnings opening | **$522,897 accumulated deficit** |
| Customers / vendors | 18 / 50 (W-9 tax-ID column blank) |
| Bank and card lines | Chase checking 587, Chase savings 49, Amex card 1 213, Amex card 2 147 |
| Sales invoices 2025 to 2026 | **$548,891.75** |
| Vendor bills 2025 to 2026 | **$754,844.24**, of which ADP is **$501,653** |
| Vendor bill coding | 293 bills. 225 pre-coded (56 flagged as judgment calls), 68 left blank: ADP 57 and Wisetack 11 |

**New open items created by Package 2, all dated 10 Aug:** the $2,211 AP gap, the savings opening balance, and six more bookkeeper flags (vendor tax IDs for 1099s, expense account codes on bills, payroll double-counting against ADP's $501,653, account code and tax type on invoices, retained-earnings mapping, and an optional 2024 Schedule L tie-out). **Eight flags, all open.**

**A number conflict dated 11 Aug** [BS-SOR §5.3]: invoiced revenue for 2025 plus 2026 Jan to Jul reads **$556,392** from the Ajera invoice register and **$548,891.75** from `xero-sales-invoices-2025-2026.csv`. Difference **$7,500.25**. Both described as verified. Unreconciled.

### 3.3 Repository [Rev 1 §3.3]

All tier A, verified 11 Aug 2026. Every commit is dated to the minute in §2 above. First commit **1 Aug 2026 12:12 CDT**, last **10 Aug 2026 07:53 CDT**. The divergence between `main` and the working branch begins **8 Aug 23:08** (`68a5e7b`), the first commit after `main`'s tip at 3 Aug 10:52.

### 3.4 Configuration [Rev 1 §3.4]

| Item | Last set | Tier |
|---|---|---|
| `.env.example` (key list) | 10 Aug 07:03 | A |
| `.env.local` (15 keys set, 10 empty) | **10 Aug 07:26** | A |
| `vercel.json` (the daily capture cron) | 9 Aug 16:39 | A |

The Monday and HubSpot key names were first documented 9 Aug 10:56 (`d3a0470`) and **corrected 18 minutes later** at 9 Aug 11:14 (`f29cee8`), from "HubSpot Private App token" to "HubSpot Service Key." That is a real revision: Service Keys replaced Private Apps for data-only integrations in 2026.

`NEXT_PUBLIC_APP_URL` has read `http://localhost:3000` since the file was created. It has never been set to a production value locally.

### 3.5 Firm and model numbers [Rev 1 §3.5]

| Number | When set | Tier | Revised |
|---|---|---|---|
| 1 to 10 timekeepers, target ~40 in 2 years | 1 Aug, migration plan §6 | A | No |
| Ryan $225/hr, Justin $200/hr | **Cannot establish.** From the undated `CLAUDE.md` hot cache | E | Superseded in basis by realized rates: Ryan $224.86, Justin $192.86, Mike $250, verified from Ajera for the 12 months to 31 Jul 2026. See C-5 |
| Delegation rates ($40 / $55 / $75 + 8%), 4x multiple, $750/hr founder rate | On or before 10 Aug (v4) | C | Revised from the v3 model. v3's own date: cannot establish |
| The 10 Aug daily log figures (5.25h, 38% founder tier, Obsidian $80K, LeMans $20K, ~$75K enterprise value) | **10 Aug 2026**, produced by the scheduled daily task | A | The ~$75K is three band estimates and remains **pending Michael's confirmation**. Unconfirmed as of today |

### 3.6 The interim workbook [Rev 1 §3.6]

| Event | When | Tier |
|---|---|---|
| Delivered | **1 Aug 2026 11:04 CDT** | A |
| Opened in Excel (lock file created) | **1 Aug 2026 17:10 CDT** | A |
| Lock file never cleared, no data ever entered | Verified 11 Aug 2026 | A |

So the workbook was delivered at 11:04 on 1 August, opened once about six hours later, and never used. The lock file has sat there for ten days. Rev 1 said it was "left open in Excel at some point"; the date is 1 August.

### 3.7 Scheduled tasks [Rev 1 §3.7]

**Correction.** Rev 1 said both were created 8 August. The scheduler's own records say otherwise [A]:

| Task | Created | Central |
|---|---|---|
| Daily output & impact capture | 2026-08-08 03:05:37Z | **7 Aug 2026 22:05 CDT** |
| Weekly output & impact roll-up | 2026-08-08 03:06:08Z | **7 Aug 2026 22:06 CDT** |

Both created the evening of 7 August, 31 seconds apart. `Brooks Output Log.csv` was not created until 10 Aug, meaning the daily task ran for two weekdays with no destination file. That gap is consistent with the memory note that the log CSV "could not be found."

---

## 4. Dating register: open questions

| Rev 1 § | Question | Raised | Days open | Status change since Rev 1 |
|---|---|---|---|---|
| 4.1 | Deltek retention deadline | **1 Aug 11:08** | 10 | Sharper and worse. Access was suspended 31 Jul (C-3) |
| 4.2 | Was the Deltek export request sent? | 1 Aug 11:08 | 10 | Still no record. BS-SOR lists "request a full data extract or backup from Deltek" as an open action, which implies not |
| 4.3 | Where is the Xero import package? | Raised 11 Aug (Rev 1) | 0 | **RESOLVED same day.** See C-2 |
| 4.4 | AR $10 and AP $585.70 variances | **8 Aug** | 3 | Still open. Package 2 added a **new** $2,211 AP gap on 10 Aug. Eight bookkeeper flags now open |
| 4.5 | Did the cutover happen on schedule? | Target set **8 Aug** | 3 | Harder than Rev 1 framed it. See C-1 |
| 4.6 | Wisconsin sales and use tax rates | 8 Aug, runbook | 3 | Package 2 records "sales tax: none collected" as the conversion setting. Whether that is the answer or a placeholder: cannot establish |
| 4.7 | Payroll in-system or dedicated provider | **1 Aug 11:08** | 10 | Still open. ADP is the de facto answer and appears in both Xero packages at $501,653 of 2025 to 2026 bills |
| 4.8 | Which facts may the app author vs propose | **9 Aug 10:55** | 2 | Unchanged |
| 4.9 | Should `main` be brought current? | Divergence began **8 Aug 23:08** | 3 | Unchanged |
| 4.10 | What happened to `fix/hubspot-email-scope`? | Branch tip **9 Aug 18:19** | 2 | **Resolved to a fact.** See §5 |
| 4.11 | Is there a WIS M3? | Raised 11 Aug | 0 | See §5 |
| 4.12 | Has anyone entered real time in the app? | Raised 11 Aug | 0 | Unchanged. The workbook fallback is confirmed unused since 1 Aug |
| 4.13 | Missing Marmik brand assets | **3 Aug 10:52** | 8 | Unchanged |
| 4.14 | Sentry and Resend unconfigured | **1 Aug 11:26** (both listed in the spec stack) | 10 | Unchanged |
| 4.15 | STS acquisition status | **1 Aug 11:26** (spec §1.1 lists it as pending) | 10 | Unchanged. Nothing in any record since |

---

## 5. Two Rev 1 questions I can now answer

### 5.1 `fix/hubspot-email-scope` is real, unmerged, and orphaned.

Commit `3960762`, **9 Aug 2026 18:19 CDT**, "fix(hubspot): drop emails (scope-gated) + make activity types resilient." Verified today: it is **not an ancestor of HEAD**. It touches one file, `src/lib/integrations/hubspot.ts`, 87 insertions and 69 deletions.

It branched after `89af7cc` (9 Aug 17:11) and was never merged. Work continued on M2 an hour later at 18:16 on a different branch. This looks like a fix that was written, left, and forgotten in the same evening.

**Why it matters.** Under D-32, a HubSpot email is a hard signal. If the HubSpot token's scope does not cover emails, then either the capture silently fails on that source (current HEAD) or emails are deliberately dropped (this branch). Neither is recorded in `DECISIONS.md`. One of the two behaviours is live and nobody wrote down which.

### 5.2 There is no WIS M3, and the decision log stopped on 9 August.

`docs/DECISIONS.md` was last modified **9 Aug 2026 10:55 CDT**, matching commit `a302b6e`. Its newest entry is the write-back posture.

**Everything after that is undocumented in the decision log:** M2 Draft (nine commits, 9 Aug), the M4 Xero export (9 Aug 22:04), the Xero OAuth flow and three scope fixes (10 Aug). `CLAUDE.md`'s workflow rule requires a running `docs/DECISIONS.md`. It has not been kept since the morning of 9 August.

On M3: the commit history runs M0, M1, M2, then M4. **No commit mentions M3.** The WIS pipeline is Capture, Draft, Confirm, Export, and the confirm loop already existed from the 2 to 3 August Signals work, which is the most likely reason M3 was skipped rather than missed. **This is inference, not a dated fact.** Nothing on disk states it.

---

## 6. What remains undatable

Stated plainly, per the instruction not to estimate.

1. **When the byte-level backup analysis began** on 1 August. Only its 11:08 publication is dated.
2. **When "QuickBooks Online Essentials plus Harvest, ~$100/mo, target live Aug 15" was decided.** It sits between 1 and 8 August, is recorded in three Brooks Stevens project-memory files, and carries no date anywhere. It is still uncorrected in that project's memory today.
3. **The day Michael rejected the "wasted time" framing** (D-39). Bounded to on or before 8 August.
4. **The days the output-log model moved v1 → v3 → v4** (D-53 through D-57). Only the v4 floor of 10 August is hard. Whether a v2 ever existed is unknown.
5. **When the `CLAUDE.md` hot-cache rates ($225 / $200) were set.** The file carries no date on any line.
6. **Whether the Ryan Hahn and Justin Gasal quoted rates were ever formally revised**, as opposed to simply diverging from realized rates over twelve months.
7. **Whether Harvest was ever killed** as the time tool. BS-SOR §5.1 records that the Xero decision was made on accounting cost and functionality only, that the time side is now called "the activity layer," and that nothing states Harvest was retired.
8. **Any decision made in conversation and never written to a file, a commit, a memory line or an artifact.** I cannot read the transcripts. This category is invisible to me by construction, and it is the largest source of risk in both Rev 1 and Rev 2.
