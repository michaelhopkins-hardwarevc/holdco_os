# Handoff: HoldCo OS, Marmik UI and the Signals timesheet

## Overview

Two things ship here.

1. **A brand reskin** of HoldCo OS onto the Marmik design system (Apex direction: carbon field, machined aluminum, acid-lime signature, mono spec labels), replacing the default shadcn light theme, and replacing the top-bar shell with a sidebar shell.
2. **Signals**, a new feature: the timesheet pre-populates itself from the tools people already work in (calendar, Linear, Figma, Git), proposing hours with evidence that the person accepts, edits, or skips. Nothing posts without acceptance.

Target repo: `michaelhopkins-hardwarevc/holdco_os`, branch `main`. Next.js 15 App Router, React 19, Tailwind v4, shadcn/ui, Drizzle on Supabase Postgres, Supabase Auth with RLS.

## About the design files

The files in this bundle are **design references created in HTML**. They are prototypes of look and behavior, not production code to lift. They are Design Components: a single HTML file each, plain React under the hood, all styling inline.

Recreate them in the existing Next.js + Tailwind + shadcn environment using its established patterns: server components for data, server actions for writes, `runWithUser()` for every read so RLS stays enforced. Do not port the inline styles. Translate them into Tailwind theme tokens and shadcn variants.

Files:

- `HoldCo OS — Marmik.dc.html` — the redesign. Clickable: sidebar navigates, role tabs in the header switch the dashboard, signal rows accept and dismiss, grid cells are editable and totals recompute, approval rows multi-select.
- `HoldCo OS — Current State.dc.html` — a faithful recreation of the app as it is today, for before/after comparison. Nothing to build from this one.

## Fidelity

**High fidelity.** Colors, type, spacing, radii and states are final and are all Marmik design-system values. Recreate pixel-accurately. Where the prototype and the design system disagree, the design system wins.

---

## Design tokens

These are the Marmik tokens. Put them in `src/app/globals.css` as the app's theme. The app is **dark only**. Delete the `:root` light block and the `.dark` block that ship with shadcn and replace the semantic mapping.

### Color

| Token | Hex | Role |
| --- | --- | --- |
| `--carbon` | `#0C0E10` | page base, input fields |
| `--graphite` | `#16191D` | every card and panel |
| `--steel` | `#22272D` | raised structure, table headers, active nav |
| `--line` | `#2A3037` | every border, 1px |
| `--alum` | `#B9BEC4` | body text |
| `--alum-2` | `#8A9097` | metadata, mono labels, placeholders |
| `--bone` | `#F2F3F1` | primary text, figures |
| `--acid` | `#C4F03B` | signature. **One hit per view.** Primary CTA only. |
| `--cyan` | `#18C6EA` | data, motion, machine-sourced values |
| `--blaze` | `#FF5A22` | alerts, exceptions, over-budget |
| `--cyan-line` | `#1f4a55` | cyan-tinted borders on dark |
| `--blaze-line` | `#5a2413` | blaze-tinted borders on dark |
| grid wash | `rgba(255,255,255,.014)` | blueprint background, 34px pitch |

Text on acid is always `--carbon`, never bone.

shadcn semantic mapping:

```
--background: #0C0E10;  --foreground: #F2F3F1;
--card: #16191D;        --card-foreground: #F2F3F1;
--popover: #16191D;     --popover-foreground: #F2F3F1;
--primary: #C4F03B;     --primary-foreground: #0C0E10;
--secondary: #22272D;   --secondary-foreground: #F2F3F1;
--muted: #22272D;       --muted-foreground: #8A9097;
--accent: #22272D;      --accent-foreground: #F2F3F1;
--destructive: #FF5A22;
--border: #2A3037;      --input: #2A3037;      --ring: #8A9097;
```

Page background, on `body`:

```css
background-color: #0C0E10;
background-image:
  linear-gradient(rgba(255,255,255,.014) 1px, transparent 1px),
  linear-gradient(90deg, rgba(255,255,255,.014) 1px, transparent 1px);
background-size: 34px 34px;
```

### Type

Three families, strict roles. Replace the Geist pair in `src/app/layout.tsx` with `next/font/google`:

| Family | Weights | Role |
| --- | --- | --- |
| Space Grotesk | 600, 700 | display, headings, button labels. `letter-spacing: -.02em` |
| Inter | 400 | body, table cells, form values |
| JetBrains Mono | 400, 500, 700 | everything technical |

Exact sizes used in the design:

| Slot | Value |
| --- | --- |
| Page heading (h1) | Space Grotesk 700, 31px, `-.02em`, `--bone` |
| Card / panel heading | JetBrains Mono, 10.5px, `.1em`, uppercase, `--bone` |
| Eyebrow | JetBrains Mono, 11px, `.2em`, uppercase, `--acid`, prefixed `// ` |
| Column header | JetBrains Mono, 10px, `.1em`, uppercase, `--alum-2` |
| Table cell, body | Inter 400, 13.5px, `--bone` |
| Table cell, secondary | Inter 400, 13px, `--alum-2` |
| Mono figure, small | JetBrains Mono, 13px to 15px, `--bone` |
| Stat figure | JetBrains Mono 500, 26px (compact) or 30px (dashboard), `--bone`, line-height 1 |
| Spec label | JetBrains Mono 700, 10.5px, `.1em`, uppercase, carbon on acid |
| Body paragraph | Inter 400, 14px, `--alum`, max 70ch, `text-wrap: pretty` |
| Small print | Inter 400, 12px, `--alum-2` |

Figures are never display type. Uppercase only ever in mono.

### Shape, spacing, motion

- Radii: 5px tags, 6px mono and small buttons and inputs, 8px buttons and nav items, 12px cards and panels, 20px pills.
- Borders 1px solid `--line`. Data rows inside a panel are `1px dashed var(--line)`. **No shadows anywhere.** Delete shadcn's `ring-1` card treatment and the `shadow-*` classes.
- Spacing scale: 6, 10, 16, 24, 36, 56. Card grid gaps 13px. Panel padding 16px.
- Transitions: `160ms cubic-bezier(.2,.6,.2,1)`, color and opacity only. No scale, no translate, no entrance animation.
- Hover: links `--alum` to `--acid`; acid buttons lighten to `#d4ff4a`; secondary buttons brighten border to `--alum-2` or `--bone`. Press darkens, it does not move. Remove `active:translate-y-px` from `button.tsx`. Disabled is 40% opacity, `not-allowed`.

### Icons

Eight glyphs only: `apex, build, terrain, speed, portfolio, hold, exit, spec`. They are in the design system at `assets/icons/*.svg` and as an `Icon` React component. 32px box, 1.6 stroke, round caps and joins, `--alum` stroke, acid accent on one detail. **Do not add lucide or any other set, and do not draw new glyphs.** If a concept has no glyph, use a mono text label. No emoji.

Sidebar mapping used: Dashboard `apex`, Timesheet `speed`, Approvals `hold`, Projects `portfolio`, Clients `terrain`, Resources `build`, Indirect codes `spec`, Entities `exit`.

Logo: reticle mark plus wordmark, the "i" set in acid. `assets/logo.svg`.

### Copy rules

Confident, plainspoken, dry. Sentence case. **Never an em-dash.** Middots (`·`) separate mono metadata. Eyebrows are prefixed `// `. Actions close with `›`. No emoji, no exclamation points. Numbers are terse and mono.

---

## Screens

### 1. App shell

Replaces the top bar in `src/app/(app)/layout.tsx`.

**Sidebar**, 244px fixed, `--graphite`, 1px right border, `position: sticky; top: 0; height: 100vh`, flex column.

- Logo block: padding 20px 18px 16px, 1px bottom border. Logo lockup at 26px, then `HOLDCO OS · REV_02` in mono 10.5px `.1em` uppercase `--alum-2`, 12px above.
- Entity switcher: full-width button, padding 14px 18px, 1px bottom border, hover `--steel`. Two stacked lines: `// ENTITY` mono 10px uppercase `--alum-2`, then the entity name in Space Grotesk 600 13.5px `--bone`, truncated. A `⇅` glyph on the right in mono 11px. This replaces the shadcn `Select` in `entity-switcher.tsx`; keep the same `selectEntity` server action.
- Nav: padding 12px 10px, 2px gap. Each item is 8px 10px, 8px radius, 11px gap, 13.5px Inter. Icon 18px. A right-aligned mono 10px count. Active: `--steel` background, `--bone` text, `--acid` count. Inactive: transparent, `--alum` text, `--alum-2` count and icon.
- Footer: 1px top border, padding 14px 18px. 26px round avatar (`--steel` fill, 1px `--line`, mono 10px initials), name 12.5px `--bone`, role mono 10px uppercase `--alum-2`. Below it `// status: logging` in mono 10px, where the word tracks the role.

**Header**, 56px, `rgba(12,14,16,.86)`, 1px bottom border, sticky, `z-index: 5`, padding 0 24px, space-between.

- Left: breadcrumb, mono 10.5px `.1em` uppercase `--alum-2`, `ENTITY  /  SCREEN`, single line with ellipsis.
- Right (`flex: 0 0 auto`, so it never shrinks): a ⌘K search button (30px tall, 6px radius, `--graphite`, 1px `--line`, mono 11px `--alum-2`, label `SEARCH ANYTHING` and the shortcut) and, in production, the user menu. The role tab group in the prototype is a **demo control only** — in production the role comes from `membership.role`.

**Content**: padding 28px 32px 72px, `max-width: 1400px`. Put `min-width: 960px` on the column that holds header and main together, not on main, so the sticky header spans the full content width.

### 2. Timesheet, with Signals

The most important screen. Replaces `src/app/(app)/timesheet/page.tsx` and `src/components/timesheet-grid.tsx`.

**Header row**: eyebrow `// TIMESHEET`, h1 `Week of Jul 27`, then mono 11.5px `RYAN HAHN · SR. INDUSTRIAL DESIGN · DRAFT`. Right side: three 32px mono buttons, `‹ PREV`, `THIS WEEK` (active, `--steel`), `NEXT ›`. Keep the existing `?week=` URL contract.

**Signals panel**. `--graphite`, 1px `--line`, 12px radius.

- Band: 13px 16px, `--steel`, 1px bottom border. Left: 7px cyan dot, then mono 10.5px uppercase `SIGNALS · 8 FROM 4 CONNECTED SOURCES`, then `31.5 H PROPOSED` in `--alum-2`. Right: `Dismiss all` (ghost mono) and `Accept all ›` (acid, 30px, 6px radius, Space Grotesk 700 12.5px). **This acid button is the view's one acid hit alongside Submit; keep only one truly primary.**
- Rows: `grid-template-columns: 64px 1fr 190px 62px 168px`, gap 14px, padding 11px 16px, `1px dashed var(--line)` top border.
  1. Source tag: mono 9.5px `.1em` uppercase, 1px border, 5px radius, 3px 6px. Calendar is cyan (`--cyan` on `--cyan-line`); Linear, Figma and Git are `--alum` on `--line`.
  2. Evidence: 13.5px `--bone` (for example "42 edits in GermPass Concepts"), and under it the mono 10.5px provenance line (`MON 27 · 4h 40m active in file`).
  3. Proposed charge: mono 11.5px `--alum`, `P-6041 · Design`.
  4. Hours: mono 15px 500 `--bone`, right aligned, two decimals.
  5. Actions: confidence (`HIGH` / `MED`, mono 9.5px `--alum-2`), then `SKIP` (ghost, hovers to blaze) and `LOG IT` (1px `--alum-2` border, `--bone`).
- Accepting a signal removes its row and adds its hours to the matching grid cell. Dismissing just removes it. When none remain, the whole panel is gone.

**Grid**. Same panel treatment. `grid-template-columns: 1fr repeat(5, 86px) 86px`.

- Header strip: 42px, `--steel`, mono 10px uppercase column labels. Day labels are `MON 27` … `FRI 31`.
- Rows: 48px, `1px dashed var(--line)` top border. Charge cell is a 2px × 22px accent bar (acid for billable project time, cyan for the second project, `--alum-2` for indirect), then the project name 13.5px `--bone` and a mono 10px line `P-6041 · DESIGN · BILLABLE $225/HR`.
- Cells: `<input type="number" step="0.25" min="0">`, 62px × 32px, centered, 6px radius, mono 13px, `--carbon` fill, 1px `--line`. **A cell whose value came from an accepted signal is tinted**: background `rgba(24,198,234,.07)`, border `--cyan-line`. That tint is the whole point, it shows what a machine proposed. Manual edits keep the tint but the number is the user's.
- Empty state: "Nothing logged yet. Accept the signals above, or add a row by hand."
- Footer strip: 46px, `--steel`, `Daily total` label, per-day totals (mono 13.5px, `--bone` at 8h or more, `--alum` below, `--alum-2` at zero), grand total mono 15px 500.

**Action row**: `+ Add row  N` and `Copy last week` as mono ghost buttons, a mono note (`8.50 h short of a 40 h week`), and `Submit week ›` as the acid primary, 38px, 8px radius.

**Stat strip**: four tiles, `repeat(4, 1fr)`, 13px gap. Each: mono 10px uppercase key, mono 26px 500 figure, a 2px × 34px accent underline, then a 12px `--alum-2` note. Logged / Billable / Value / Submit by.

**Sources footer**: one panel explaining the contract in plain words ("Nothing posts to a timesheet without you accepting it") plus mono tags for each connected source and `+ Add source`.

### 3. Dashboard

Replaces `src/app/(app)/dashboard/page.tsx`. Three variants driven by `membership.role`, not by a UI toggle.

Shared structure: eyebrow, h1, a 14px `--alum` blurb at 70ch, then a four-up stat grid, then a two-column body at `1.45fr 1fr`.

- Left column: a burn panel. Header strip with a mono title and `HOURS USED / BUDGET`. Each row: code (mono 11.5px `--alum-2`), name (14px `--bone`), figure right-aligned in the bar's color, then a 4px progress bar, `--steel` track, 20px radius. Bar color: cyan under 80%, blaze at 80% and over, acid for the person's own primary project.
- Right column, top: a **SpecCard** (the design system's signature object). Acid band, mono 10.5px 700 carbon label on the left and `REV_02` on the right, then a Space Grotesk 700 19px title and dashed key/value rows in mono 12px.
- Right column, bottom: "Needs attention". Each row is a 6px colored dot, a 13px `--alum` sentence, and a mono 10.5px tag. Blaze for problems, cyan for opportunities, acid for deadlines.

Role content:

| | Staff | Manager | Principal |
| --- | --- | --- | --- |
| Eyebrow | `// my week` | `// manager view` | `// principal view` |
| Heading | Build cool shit. Make it pay. | Owned together, run better. | Venture returns from simple businesses. |
| Stats | Logged this week, Billable share, Signals waiting, Streak | Awaiting review, Team utilization, Billable this week, Missing time | Backlog, Utilization, Effective rate, Cash days |
| Burn | My projects this week | Budget burn by project | Contract burn, all entities |
| Spec card | SPEC // ME, the person's rates | SPEC // WEEK, the week's totals | SPEC // HOLDCO, trailing 13 weeks |

The principal view rolls up across entities, which means those queries deliberately read outside a single `active_entity`. Scope them to the user's memberships, still through RLS.

### 4. Approvals

Replaces `src/app/(app)/approvals/page.tsx`. Grouped by person and week, as today, but a selectable table instead of stacked cards.

- Header: eyebrow, h1 `Four weeks waiting on you`, mono subline. Right: `N selected`, `Send back` (secondary), `Approve selected ›` (acid).
- Table: `grid-template-columns: 34px 1.4fr 108px 92px 92px 1fr 96px`. Header strip 42px `--steel`. Rows 56px, dashed top border, clickable to toggle.
  - Checkbox: 15px, 4px radius, `--acid` fill with a carbon `✓` when selected, else 1px `--line`.
  - Selected row background: `rgba(196,240,59,.035)`.
  - Person: name 14px `--bone`, title mono 10px `--alum-2`.
  - Hours, Billable, Util: mono, right aligned. Util colors: cyan above target, `--alum` near it, blaze below.
  - Exceptions: mono 9.5px blaze tags on `--blaze-line` borders. Rules to implement: under 40 h, over 45 h, a weekday with zero hours, utilization below the resource's `targetUtilization` by more than 10 points.
  - Status: `CLEAN` in `--alum-2`, `REVIEW` in `--blaze`.
- Bulk approve and bulk reject call the existing `approveWeek` / `rejectWeek` actions once per selected week, in one transaction. Rejection still needs a note.
- Keyboard: `A` approve, `S` send back, `J`/`K` move.

### 5. Projects

Replaces `src/app/(app)/projects/page.tsx`. `grid-template-columns: 86px 1.5fr 1.1fr 116px 1fr 120px 96px`, rows 58px.

Code in mono `--acid` and linked. Name 14px `--bone`. Client 13px `--alum-2`, truncated. Type as a mono uppercase label (`T & M`, `NOT TO EXCEED`, `FIXED FEE`), not the raw enum. Burn is a stacked mono figure (`386 / 460 H · 84%`) over a 4px bar. Contract right-aligned mono, `OPEN` for T&M. Status mono uppercase, blaze for `AT RISK`.

The inline "New project" card moves into a sheet behind the acid `New project ›` button. Keep the same `createProject` server action and field set.

### 6. Clients, Resources, Indirect codes, Entities

One shared dense-table pattern. Eyebrow, h1, a 70ch blurb, an acid `New X ›` button, then the panel table: 42px `--steel` header strip with mono 10px uppercase labels, 52px rows on dashed borders, 13.5px cells, mono for anything numeric, right-aligned numerics.

Columns as designed:

- **Clients**: Client, Primary contact, Terms, Open WIP, Status. `1.6fr 1fr 130px 130px 120px`.
- **Resources**: Name, Title, Bill, Cost, Target, Utilization (4 wk), Status. `1.3fr 1.2fr 110px 110px 90px 1fr 110px`. Utilization colors as in Approvals.
- **Indirect codes**: Code (mono acid), Category, Description, Hours (4 wk), Active. `110px 180px 1.6fr 150px 110px`.
- **Entities**: Entity, Legal name, Type, People, Your role, Status. `1.5fr 1fr 130px 130px 130px 110px`.

Open WIP, utilization and 4-week hours are new derived columns. They come from `time_entry` aggregates, not new tables.

### 7. Login

Not redesigned in the prototype. Apply the shell: carbon page with the grid wash, the logo lockup above a `--graphite` panel with a 1px `--line` border and 12px radius, `--carbon` inputs, `Sign in` as the acid primary and `Continue with Google` as secondary. Keep `login-form.tsx` logic untouched.

### 8. Command palette

⌘K. Full-screen `rgba(12,14,16,.72)` scrim, a 620px `--graphite` panel at 14vh, 12px radius. Input row 15px with an acid `›` prompt. Results are dashed rows: a mono kind tag, a 13.5px label, and a mono shortcut hint on the right.

It is not just navigation. It takes commands: `Log 4.00 h to P-6041 · Design, today`, `Accept all 8 signals for this week`, `Submit week of Jul 27`, `Switch entity to Marmik HoldCo`.

---

## Interactions and behavior

- Navigation is real routing. The prototype's internal screen switch is a prototype device.
- Signal accept: optimistic. Add hours to the cell, tint it, remove the signal row, recompute row/day/grand totals. Persist on Save or Submit, same as manual entry.
- Accept all: applies every remaining live signal in one pass.
- Grid cell edit: `step 0.25`, minimum 0, empty means zero. Totals recompute on change.
- Submit: existing `submitWeek` action. A submitted week locks, as it does today.
- Approvals selection persists while filtering. Bulk actions clear it.
- Transitions: 160ms, color and opacity only.
- Responsive: the app is desktop-first with a 960px floor. Mobile time entry is a separate piece of work and is not designed here.

## State

Client state is small and all local to the timesheet and approvals components:

- `hours: Record<rowKey, number[5]>` keyed `projectId|phaseId` or `indirect|codeId`
- `fromSignal: Record<"rowKey|dayIndex", boolean>` for the cyan tint
- `acceptedSignalIds: string[]`, `dismissedSignalIds: string[]`
- `selectedWeekIds: string[]` on Approvals
- `cmdOpen: boolean`

Everything else is server state through server components and server actions.

---

## What Signals actually requires on the backend

This is the only part of the handoff that is not a reskin. Suggested shape:

1. **New tables.** `source_connection` (entity, user, provider, OAuth tokens, scopes, status) and `signal` (entity, resource, work_date, provider, external_id, evidence text, provenance text, proposed project/phase or indirect code, proposed hours, confidence, state: `open` / `accepted` / `dismissed`, `time_entry_id` once accepted). Unique on `(provider, external_id, resource_id)` so re-syncs are idempotent. Both get the same `organizationId` / `entityId` columns and RLS policies as every other table in `src/db/schema/`.
2. **Providers.** Start with Google Calendar (busy events with attendees and titles) and one issue tracker. Figma and Git are second wave. Read-only scopes, per-user OAuth, tokens encrypted at rest.
3. **Mapping.** Signal to project is the hard part and should be explicit before it is clever: a keyword and code map per project (calendar title contains `GermPass`, Linear team is `BSD`, repo is `germpass-firmware`), then learn from what the person accepts and correct over time. Show `HIGH` / `MED` confidence and always show the evidence, so a wrong guess is obvious and cheap to skip.
4. **Sync.** A nightly job per connected user plus an on-demand refresh when the timesheet loads. Never write a `time_entry` from a job. Only acceptance writes.
5. **Privacy.** Say plainly what is read and store the minimum. Titles and durations, not bodies. Let a person disconnect a source and delete its signals.

## Suggested order

1. Tokens, fonts and the primitive restyle (`globals.css`, `layout.tsx`, `src/components/ui/*`). Every existing screen goes dark and on-brand with no structural change.
2. The shell: sidebar, header, entity switcher.
3. Screen-by-screen layout: Timesheet grid, Approvals, Projects, then the four record tables.
4. Derived columns: utilization, burn, open WIP.
5. Command palette.
6. Signals: schema and RLS, then one provider end to end, then the panel.

Steps 1 to 5 are UI work against data that already exists. Step 6 is a product.

## Assets

- Marmik design system: logo (`assets/logo.svg`, plus mono bone and mono carbon variants) and the eight icons (`assets/icons/*.svg`). Copy the SVGs into `public/brand/` rather than redrawing them.
- Fonts: Space Grotesk, Inter and JetBrains Mono, all Google Fonts, loaded through `next/font/google`.
- No photography anywhere in this design. If imagery is added later the direction is documentary shop floor, high contrast, no stock finance imagery.

## Files in this bundle

- `HoldCo OS — Marmik.dc.html` — the redesign, clickable.
- `HoldCo OS — Current State.dc.html` — the app as it is today, for comparison.
