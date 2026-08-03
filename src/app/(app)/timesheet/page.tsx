import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TimesheetGrid, type GridRow } from "@/components/timesheet-grid";
import { ExportCsvButton } from "@/components/export-csv-button";
import { runWithUser } from "@/db/rls";
import { syncOutlook } from "@/lib/actions/connections";
import {
  acceptAllSignalsAction,
  acceptSignalAction,
  dismissAllSignalsAction,
  dismissSignalAction,
  generateSampleSignals,
} from "@/lib/actions/signals";
import { addTimeEntry, submitWeek } from "@/lib/actions/timesheet";
import { MANAGER_ROLES, requireActiveEntity } from "@/lib/auth";
import { getOutlookConnection } from "@/lib/integrations/outlook-store";
import {
  getResource,
  getResourceForUser,
  getWeekEntries,
  listEntityPhases,
  listIndirectCodes,
  listOpenSignals,
  listPeerChargesForSharedIds,
  listProjects,
  listResources,
} from "@/lib/queries";
import {
  type Charge,
  chargeKey,
  consistencyNudge,
  type Nudge,
  type PeerCharge,
} from "@/lib/consistency";
import {
  addWeeks,
  deriveWeekStatus,
  getWeek,
  isWeekEditable,
  type TimeEntryStatus,
  toISODate,
  weekdayLabel,
} from "@/lib/timesheet";

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{
    week?: string;
    resource?: string;
    syncEvents?: string;
    syncCreated?: string;
    syncError?: string;
  }>;
}) {
  const { ctx, active } = await requireActiveEntity();
  const sp = await searchParams;
  const week = getWeek(sp.week ?? toISODate(new Date()));
  const isManager = MANAGER_ROLES.includes(active.role);

  let syncMessage: string | null = null;
  let syncIsError = false;
  if (sp.syncError) {
    syncIsError = true;
    syncMessage = `Couldn't pull from Outlook: ${sp.syncError}`;
  } else if (sp.syncEvents !== undefined) {
    const events = Number(sp.syncEvents);
    const created = Number(sp.syncCreated ?? 0);
    if (events === 0) {
      syncMessage =
        "No calendar events found for this week. Pick a week that has meetings, or check that events exist in your Outlook.";
    } else if (created === 0) {
      syncMessage = `Found ${events} calendar event${events === 1 ? "" : "s"}, but they were already imported or couldn't be matched to a project or indirect code.`;
    } else {
      syncMessage = `Imported ${created} new signal${created === 1 ? "" : "s"} from ${events} calendar event${events === 1 ? "" : "s"}.`;
    }
  }

  const data = await runWithUser(ctx.authUser.id, async (tx) => {
    // A manager can open a team member's week via ?resource; otherwise own.
    let res: Awaited<ReturnType<typeof getResourceForUser>>[number] | undefined;
    if (sp.resource && isManager) {
      [res] = await getResource(tx, active.entityId, sp.resource);
    }
    if (!res) {
      [res] = await getResourceForUser(tx, active.entityId, ctx.appUser.id);
    }
    const teamResources = isManager
      ? await listResources(tx, active.entityId, { activeOnly: true })
      : [];
    if (!res) return { res: null as null, teamResources };
    return {
      res,
      teamResources,
      entries: await getWeekEntries(tx, active.entityId, res.id, week.start, week.end),
      projects: await listProjects(tx, active.entityId),
      phases: await listEntityPhases(tx, active.entityId),
      codes: await listIndirectCodes(tx, active.entityId, { activeOnly: true }),
      signals: await listOpenSignals(tx, active.entityId, res.id, week.start, week.end),
    };
  });

  if (!data.res) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Timesheet</h1>
        <p className="text-muted-foreground">
          No resource is linked to your account yet. An admin needs to create a
          resource (under Resources) linked to your user before you can enter
          time.
        </p>
      </div>
    );
  }

  const { res, entries, projects, phases, codes, signals, teamResources } = data;
  const isOwn = res.userId === ctx.appUser.id;
  const canOverride = isManager;

  // Consistency nudges (Signals step 3): for signals tied to a shared meeting,
  // see how teammates charged the same meeting and flag a divergent guess.
  const nudges = new Map<string, Nudge>();
  const sharedIds = [
    ...new Set(signals.map((s) => s.sharedId).filter((x): x is string => !!x)),
  ];
  if (sharedIds.length > 0) {
    const peerRows = await runWithUser(ctx.authUser.id, (tx) =>
      listPeerChargesForSharedIds(tx, active.entityId, res.id, sharedIds),
    );
    const bySharedId = new Map<string, PeerCharge[]>();
    for (const r of peerRows) {
      if (!r.sharedId) continue;
      const label =
        r.chargeType === "project"
          ? (r.projectCode ?? "a project")
          : (r.indirectCodeLabel ?? "an indirect code");
      const list = bySharedId.get(r.sharedId) ?? [];
      list.push({
        charge: {
          chargeType: r.chargeType,
          projectId: r.projectId,
          phaseId: r.phaseId,
          indirectCodeId: r.indirectCodeId,
        },
        label,
      });
      bySharedId.set(r.sharedId, list);
    }
    for (const s of signals) {
      if (!s.sharedId) continue;
      const peers = bySharedId.get(s.sharedId);
      if (!peers) continue;
      const myCharge: Charge = {
        chargeType: s.chargeType,
        projectId: s.projectId,
        phaseId: s.phaseId,
        indirectCodeId: s.indirectCodeId,
      };
      const n = consistencyNudge(chargeKey(myCharge), peers);
      if (n) nudges.set(s.id, n);
    }
  }
  const outlookConnected =
    isOwn &&
    Boolean(await getOutlookConnection(active.entityId, ctx.appUser.id));

  // The charge targets a user can assign a signal to (projects + phases, and
  // indirect codes), for the editable per-signal selector.
  const chargeTargets: { value: string; label: string }[] = [];
  for (const p of projects) {
    chargeTargets.push({ value: `project:${p.id}:`, label: `${p.code} · ${p.name}` });
    for (const ph of phases.filter((x) => x.projectId === p.id)) {
      chargeTargets.push({
        value: `project:${p.id}:${ph.id}`,
        label: `${p.code} · ${ph.name}`,
      });
    }
  }
  for (const c of codes) {
    chargeTargets.push({ value: `indirect:${c.id}`, label: `${c.code} · ${c.category}` });
  }
  const defaultCharge = (s: (typeof signals)[number]) =>
    s.chargeType === "project"
      ? `project:${s.projectId}:${s.phaseId ?? ""}`
      : `indirect:${s.indirectCodeId}`;

  const rowMap = new Map<string, GridRow>();
  const statuses: TimeEntryStatus[] = [];
  for (const e of entries) {
    statuses.push(e.status);
    const key =
      e.chargeType === "project"
        ? `project:${e.projectId}:${e.phaseId}`
        : `indirect:${e.indirectCodeId}`;
    const label =
      e.chargeType === "project"
        ? `${e.projectCode ?? ""} · ${e.phaseName ?? ""}`
        : (e.indirectCodeLabel ?? "Indirect");
    let row = rowMap.get(key);
    if (!row) {
      row = {
        key,
        label,
        chargeType: e.chargeType,
        projectId: e.projectId,
        phaseId: e.phaseId,
        indirectCodeId: e.indirectCodeId,
        hours: {},
        billRate: e.billRate,
        costRate: e.costRate,
        billable: e.billable,
      };
      rowMap.set(key, row);
    }
    row.hours[e.workDate] = (row.hours[e.workDate] ?? 0) + Number(e.hours);
  }

  const rows = [...rowMap.values()];
  const editable = isWeekEditable(statuses);
  const status = deriveWeekStatus(statuses);
  const dayLabels = week.days.map(
    (d, i) => `${weekdayLabel(i)} ${d.slice(5)}`,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Timesheet — {res.name}</h1>
          <p className="text-muted-foreground">
            Week of {week.start} · status: {status}
          </p>
          {isManager && teamResources.length > 0 && (
            <form className="mt-2 flex items-center gap-2">
              <input type="hidden" name="week" value={week.start} />
              <span className="text-xs text-muted-foreground">Viewing:</span>
              <select
                name="resource"
                defaultValue={res.id}
                className="h-8 rounded-md border bg-transparent px-2 text-sm"
              >
                {teamResources.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.name}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="outline" size="sm">
                View
              </Button>
            </form>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/timesheet?week=${addWeeks(week.start, -1)}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            ← Prev
          </Link>
          <Link
            href={`/timesheet?week=${toISODate(new Date())}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            This week
          </Link>
          <Link
            href={`/timesheet?week=${addWeeks(week.start, 1)}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Next →
          </Link>
          <ExportCsvButton
            type="time-entries"
            entityId={active.entityId}
            label="Export time"
          />
        </div>
      </div>

      {syncMessage && (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            syncIsError ? "text-destructive" : "bg-muted"
          }`}
        >
          {syncMessage}
        </p>
      )}

      {!editable && (
        <p className="rounded-lg border bg-muted px-3 py-2 text-sm">
          This week is <strong>{status}</strong> and locked. A manager must
          reject it before it can be edited again.
        </p>
      )}

      {editable && (
        <section className="rounded-lg border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm font-medium">
                Signals · {signals.length} proposed
                <span className="ml-2 font-normal text-muted-foreground">
                  from your connected tools
                </span>
              </div>
              {outlookConnected ? (
                <form action={syncOutlook}>
                  <input type="hidden" name="entityId" value={active.entityId} />
                  <input type="hidden" name="resourceId" value={res.id} />
                  <input type="hidden" name="weekStart" value={week.start} />
                  <Button type="submit" variant="outline" size="sm">
                    Refresh from Outlook
                  </Button>
                </form>
              ) : (
                <a
                  href="/connections"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Connect Outlook
                </a>
              )}
            </div>
            {signals.length > 0 && (
              <div className="flex items-center gap-2">
                <form action={dismissAllSignalsAction}>
                  <input type="hidden" name="entityId" value={active.entityId} />
                  <input type="hidden" name="resourceId" value={res.id} />
                  <input type="hidden" name="weekStart" value={week.start} />
                  <Button type="submit" variant="ghost" size="sm">
                    Dismiss all
                  </Button>
                </form>
                <form action={acceptAllSignalsAction}>
                  <input type="hidden" name="entityId" value={active.entityId} />
                  <input type="hidden" name="resourceId" value={res.id} />
                  <input type="hidden" name="weekStart" value={week.start} />
                  <Button type="submit" size="sm">
                    Accept all
                  </Button>
                </form>
              </div>
            )}
          </div>

          {signals.length === 0 ? (
            <div className="flex flex-col items-start gap-3 px-4 py-4">
              <p className="text-sm text-muted-foreground">
                No signals yet. Once your calendar and tools are connected,
                proposed hours show up here to accept or skip — nothing posts
                without you accepting it. For now, generate a few samples to try
                the flow.
              </p>
              <form action={generateSampleSignals}>
                <input type="hidden" name="entityId" value={active.entityId} />
                <input type="hidden" name="resourceId" value={res.id} />
                <input type="hidden" name="weekStart" value={week.start} />
                <Button type="submit" variant="outline" size="sm">
                  Generate sample signals
                </Button>
              </form>
            </div>
          ) : (
            signals.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="rounded border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                      {s.provider}
                    </span>
                    <span className="font-medium">{s.evidence}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {s.provenance ? `${s.provenance} · ` : ""}
                    {s.chargeType === "project"
                      ? `${s.projectCode ?? ""} · ${s.phaseName ?? ""}`
                      : (s.indirectCodeLabel ?? "Indirect")}{" "}
                    · {s.confidence.toUpperCase()}
                  </div>
                  {nudges.has(s.id) && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                      <span>
                        {nudges.get(s.id)!.agree} of {nudges.get(s.id)!.total}{" "}
                        teammates logged this meeting to{" "}
                        <strong>{nudges.get(s.id)!.label}</strong>.
                      </span>
                      <form action={acceptSignalAction}>
                        <input type="hidden" name="signalId" value={s.id} />
                        <input type="hidden" name="charge" value={nudges.get(s.id)!.value} />
                        <Button type="submit" variant="outline" size="xs">
                          Use their charge
                        </Button>
                      </form>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm">
                    {Number(s.proposedHours)} h
                  </span>
                  <form
                    action={acceptSignalAction}
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="signalId" value={s.id} />
                    <Select name="charge" defaultValue={defaultCharge(s)}>
                      <SelectTrigger className="h-8 w-[200px]">
                        <SelectValue placeholder="Choose a charge" />
                      </SelectTrigger>
                      <SelectContent>
                        {chargeTargets.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="submit" variant="outline" size="sm">
                      Log it
                    </Button>
                  </form>
                  <form action={dismissSignalAction}>
                    <input type="hidden" name="signalId" value={s.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Skip
                    </Button>
                  </form>
                </div>
              </div>
            ))
          )}
        </section>
      )}

      <TimesheetGrid
        entityId={active.entityId}
        resourceId={res.id}
        weekStart={week.start}
        days={week.days}
        dayLabels={dayLabels}
        editable={editable}
        canOverride={canOverride}
        resourceBillRate={res.billRate}
        resourceCostRate={res.costRate}
        initialRows={rows}
        projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
        phases={phases}
        indirectCodes={codes.map((c) => ({ id: c.id, code: c.code }))}
      />

      {editable && (
        <form
          action={addTimeEntry}
          className="flex flex-wrap items-end gap-3 rounded-lg border p-3"
        >
          <input type="hidden" name="entityId" value={active.entityId} />
          <input type="hidden" name="resourceId" value={res.id} />
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Add a single entry</span>
            <select
              name="charge"
              required
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              defaultValue=""
            >
              <option value="" disabled>
                Choose a charge
              </option>
              {chargeTargets.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Day</span>
            <select
              name="date"
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              defaultValue={week.days[0]}
            >
              {week.days.map((d, i) => (
                <option key={d} value={d}>
                  {weekdayLabel(i)} {d.slice(5)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Hours</span>
            <input
              type="number"
              name="hours"
              min={0}
              step={0.25}
              required
              className="h-9 w-24 rounded-md border bg-transparent px-2 text-sm"
              placeholder="2"
            />
          </div>
          <Button type="submit" variant="outline">
            Add entry
          </Button>
        </form>
      )}

      {editable && statuses.length > 0 && (
        <form action={submitWeek} className="border-t pt-4">
          <input type="hidden" name="entityId" value={active.entityId} />
          <input type="hidden" name="resourceId" value={res.id} />
          <input type="hidden" name="weekStart" value={week.start} />
          <Button type="submit">Submit week for approval</Button>
        </form>
      )}
    </div>
  );
}
