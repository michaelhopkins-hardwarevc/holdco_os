# HoldCo OS — Phase 1 Remaining Prompts (4–9)

Continue in the **same Claude Code session** you used for Prompts 1–3. Paste one at a time; after each finishes, click the preview link and verify before moving on. If anything errors, paste the error back into that same chat and let Claude Code fix it.

The pattern for every milestone: *restate the acceptance criteria → write tests first → implement to green → give me a preview URL and how to verify → follow CLAUDE.md → don't build ahead.*

---

## Prompt 4 — §7.2 Setup (clients, projects, phases, resources, indirect codes)

```
Milestone: §7.2 SETUP — clients, projects, phases, resources, indirect codes. First restate
the §7.2 acceptance criteria, then write tests for them, then implement to green.

Build create/edit/list screens (scoped to the selected entity) for: clients with contacts;
projects (type, contract value, project manager, status) with phases (budget hours and amount);
resources (bill rate, cost rate, target utilization); and indirect codes, pre-seeded with the
standard overhead buckets. A project page shows a budget summary across its phases. Deactivating
a resource hides it from new time entry but preserves history.

End with a preview URL and 3 lines on what to click to verify. Follow CLAUDE.md. Do not build
beyond §7.2.
```
**Verify:** create a client, a project with two phases, and a couple of resources; the project shows a budget summary.

---

## Prompt 5 — §7.3 Time entry (the core workflow)

```
Milestone: §7.3 TIME ENTRY. Restate the §7.3 acceptance criteria, write tests first, implement
to green.

Build a weekly timesheet grid (rows = a project/phase or an indirect code, columns = days of the
week, cells = hours), plus a single-entry add form. Billable flag, bill rate, and cost rate
auto-populate from the project/resource but are overridable by a manager. Billable amount =
hours x bill rate (billable only); cost amount = hours x cost rate (always). A user can submit a
week; a manager can approve or reject with a note. A submitted week locks against edits until
rejected. Record approvals in the audit log. Time entry must work on a phone-sized screen.

Preview URL + how to verify. Follow CLAUDE.md. Do not build beyond §7.3.
```
**Verify:** log a week of hours (some billable project time, some indirect), submit it, approve it as a manager; confirm totals and that indirect time shows no billable amount.

---

## Prompt 6 — §7.4 Expenses

```
Milestone: §7.4 EXPENSES. Restate the §7.4 acceptance criteria, write tests first, implement to
green.

Let a user log project expenses with a receipt upload (Supabase Storage), a category, a billable
flag, and an optional markup percentage. Billable expenses become available to invoicing;
non-billable expenses are excluded from client invoices.

Preview URL + how to verify. Follow CLAUDE.md. Do not build beyond §7.4.
```
**Verify:** add a billable expense with a receipt and a non-billable one; confirm the receipt is viewable.

---

## Prompt 7 — §7.5 Invoicing, WIP & AR  *(after this you can bill for real)*

```
Milestone: §7.5 INVOICING, WIP & AR. Restate the §7.5 acceptance criteria, write tests first,
implement to green — and include a reconciliation test proving invoice, WIP, and AR totals tie
out to the underlying time / expense / payment records.

Generate a draft invoice for a project and period that pulls all approved, uninvoiced billable
time and expenses into invoice lines (grouped by phase/resource, configurable). Allow editing
lines and adding manual/fixed-fee lines; mark the invoice sent; record payments; show status.
Time pulled onto an invoice flips to 'invoiced' and cannot be double-billed. Track WIP (approved
billable value not yet invoiced) and AR with aging buckets (0-30 / 31-60 / 61-90 / 90+). Generate
a branded PDF stored in Storage.

Preview URL + how to verify. Follow CLAUDE.md. Do not build beyond §7.5.
```
**Verify:** generate an invoice from the approved time, confirm those hours can't be billed again, download the PDF, record a payment, and check AR updates.

---

## Prompt 8 — §7.6 Reporting & dashboards

```
Milestone: §7.6 REPORTING & DASHBOARDS. Restate the §7.6 acceptance criteria, write tests first,
implement to green — include reconciliation tests that report totals match the underlying records.

Build: (1) project profitability — budget vs actual (hours and $), billable value, cost, margin,
% fee used, and WIP, per project and per phase; (2) utilization — billable vs total hours per
resource vs target, by period; (3) a firm dashboard — billable $, cost, margin, utilization, WIP,
and AR outstanding, filterable by entity and date range. Every report exports to CSV.

Preview URL + how to verify. Follow CLAUDE.md. Do not build beyond §7.6.
```
**Verify:** open each report and confirm the numbers match what you entered; export one to CSV.

---

## Prompt 9 — §7.7 Data import / export  *(load your history here)*

```
Milestone: §7.7 DATA IMPORT/EXPORT. Restate the §7.7 acceptance criteria, write tests first,
implement to green.

Build CSV import for clients, projects, resources, and historical time entries, mapped to the
columns of the interim Excel workbook, with a validation report listing any rows that couldn't be
imported and why. Add CSV export to every list. Test the importer against the interim workbook's
Projects, Employees, and Time tabs.

Preview URL + how to verify. Follow CLAUDE.md. Do not build beyond §7.7.
```
**Verify:** export the interim workbook's Projects/Employees/Time tabs to CSV and import them; confirm the records land correctly and the validation report catches any bad rows.

---

## When Phase 1 is done
You'll have a working replacement for Ajera across Brooks Stevens and STS: time, expenses, billing, WIP/AR, profitability, utilization, and data import. Retire the interim workbook once §7.5 is verified in production.

**Then Phase 2** (QuickBooks integration + consolidated reporting) begins — same pattern, from Spec §11 and §8.1. Ask me for the Phase 2 prompts when you're ready, and bring me anything that gets stuck along the way.
