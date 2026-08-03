import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import Link from "next/link";
import { BurnRow, PageHeader, Panel, SpecCard, StatTile } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";
import { runWithUser } from "@/db/rls";
import { resource, timeEntry } from "@/db/schema";
import { resolveActiveEntity } from "@/lib/active-entity";
import { requireContext } from "@/lib/auth";
import { computeArAging } from "@/lib/invoicing-db";
import {
  firmDashboard,
  projectProfitability,
  utilizationByResource,
} from "@/lib/reports-db";
import { formatCents } from "@/lib/money";
import {
  getResourceForUser,
  listOpenSignals,
  listSubmittedEntries,
} from "@/lib/queries";
import { addWeeks, getWeek } from "@/lib/timesheet";

function pct(n: number | null): string {
  return n === null ? "—" : `${Math.round(n)}%`;
}

export default async function DashboardPage() {
  const ctx = await requireContext();
  const active = await resolveActiveEntity(ctx.memberships);

  if (!active) {
    return (
      <div className="flex flex-col items-start gap-4">
        <PageHeader
          eyebrow="welcome"
          title="Welcome to HoldCo OS"
          blurb="You're not a member of any entity yet. Create your first entity to get started. You'll become its owner."
        />
        <Link href="/entities" className={buttonVariants()}>
          Create your first entity ›
        </Link>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const week = getWeek(today);
  const range4 = { from: getWeek(addWeeks(today, -3)).start, to: today };
  const role = active.role;
  const isManager = role === "manager" || role === "admin" || role === "owner";
  const isPrincipal = role === "admin" || role === "owner";

  const data = await runWithUser(ctx.authUser.id, async (tx) => {
    const dashWeek = await firmDashboard(tx, active.entityId, { from: week.start, to: week.end }, today);
    const profit = await projectProfitability(tx, active.entityId);
    const ar = await computeArAging(tx, active.entityId, today);
    const util4 = await utilizationByResource(tx, active.entityId, range4);
    const submitted = await listSubmittedEntries(tx, active.entityId);
    const [myRes] = await getResourceForUser(tx, active.entityId, ctx.appUser.id);

    const weekHours = await tx
      .select({
        resourceId: timeEntry.resourceId,
        total: sql<number>`coalesce(sum(${timeEntry.hours}),0)::float`,
        billable: sql<number>`coalesce(sum(case when ${timeEntry.billable} then ${timeEntry.hours} else 0 end),0)::float`,
      })
      .from(timeEntry)
      .where(
        and(
          eq(timeEntry.entityId, active.entityId),
          gte(timeEntry.workDate, week.start),
          lte(timeEntry.workDate, week.end),
          isNull(timeEntry.deletedAt),
        ),
      )
      .groupBy(timeEntry.resourceId);

    const activeResources = await tx
      .select({ id: resource.id })
      .from(resource)
      .where(and(eq(resource.entityId, active.entityId), eq(resource.status, "active"), isNull(resource.deletedAt)));

    let mySignals = 0;
    let myWeek = { total: 0, billable: 0 };
    if (myRes) {
      const s = await listOpenSignals(tx, active.entityId, myRes.id, week.start, week.end);
      mySignals = s.length;
      const mine = weekHours.find((w) => w.resourceId === myRes.id);
      if (mine) myWeek = { total: mine.total, billable: mine.billable };
    }

    return { dashWeek, profit, ar, util4, submitted, myRes, weekHours, activeResources, mySignals, myWeek };
  });

  const submittedWeeks = new Set(
    data.submitted.map((s) => `${s.resourceId}:${getWeek(s.workDate).start}`),
  ).size;
  const hoursById = new Map(data.weekHours.map((w) => [w.resourceId, w.total]));
  const missingTime = data.activeResources.filter((r) => (hoursById.get(r.id) ?? 0) < 40).length;
  const effRate =
    data.dashWeek.billableHours > 0
      ? Math.round(data.dashWeek.billable / data.dashWeek.billableHours)
      : 0;

  // Burn: projects with a fee, by % of fee consumed.
  const burn = data.profit
    .filter((p) => p.contractValue && p.contractValue > 0)
    .map((p) => ({
      code: p.code,
      name: p.name,
      pct: p.pctFeeUsed ?? 0,
      figure: `${p.pctFeeUsed ?? 0}%`,
    }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 6);

  // Needs attention.
  const attention: { color: "cyan" | "blaze" | "acid"; text: string; tag: string }[] = [];
  for (const p of data.profit) {
    if (p.pctFeeUsed !== null && p.pctFeeUsed >= 90) {
      attention.push({ color: "blaze", text: `${p.code} ${p.name} is at ${p.pctFeeUsed}% of its fee.`, tag: "OVER" });
    }
  }
  if (data.ar.buckets["90+"] > 0) {
    attention.push({ color: "blaze", text: `${formatCents(data.ar.buckets["90+"])} in receivables over 90 days.`, tag: "AR 90+" });
  }
  for (const r of data.util4) {
    if (r.utilizationPct !== null && r.targetPct !== null && r.utilizationPct < r.targetPct - 10) {
      attention.push({ color: "cyan", text: `${r.name} is at ${Math.round(r.utilizationPct)}% utilization, below a ${r.targetPct}% target.`, tag: "UTIL" });
    }
  }
  const attentionTop = attention.slice(0, 6);

  // Role-specific header + stats + spec card.
  const header = isPrincipal
    ? { eyebrow: "principal view", title: "Venture returns from simple businesses." }
    : isManager
      ? { eyebrow: "manager view", title: "Owned together, run better." }
      : { eyebrow: "my week", title: "Build cool shit. Make it pay." };

  const stats = isPrincipal
    ? [
        { label: "Backlog (WIP)", value: formatCents(data.dashWeek.wip), accent: "cyan" as const },
        { label: "Utilization", value: pct(data.dashWeek.utilizationPct), accent: "acid" as const },
        { label: "Effective rate", value: effRate ? `${formatCents(effRate)}/h` : "—", accent: "cyan" as const },
        { label: "AR outstanding", value: formatCents(data.dashWeek.arOutstanding), accent: "blaze" as const },
      ]
    : isManager
      ? [
          { label: "Awaiting review", value: String(submittedWeeks), accent: "blaze" as const },
          { label: "Team utilization", value: pct(data.dashWeek.utilizationPct), accent: "acid" as const },
          { label: "Billable this week", value: formatCents(data.dashWeek.billable), accent: "cyan" as const },
          { label: "Missing time", value: String(missingTime), accent: "blaze" as const },
        ]
      : [
          { label: "Logged this week", value: `${data.myWeek.total.toFixed(2)} h`, accent: "cyan" as const },
          {
            label: "Billable share",
            value: data.myWeek.total > 0 ? `${Math.round((data.myWeek.billable / data.myWeek.total) * 100)}%` : "—",
            accent: "acid" as const,
          },
          { label: "Signals waiting", value: String(data.mySignals), accent: "cyan" as const },
          { label: "Streak", value: "—", accent: "alum" as const },
        ];

  const specCard = isPrincipal
    ? {
        label: "spec // holdco",
        title: active.entityName,
        rows: [
          { k: "WIP", v: formatCents(data.dashWeek.wip) },
          { k: "AR outstanding", v: formatCents(data.dashWeek.arOutstanding) },
          { k: "Utilization", v: pct(data.dashWeek.utilizationPct) },
          { k: "Effective rate", v: effRate ? `${formatCents(effRate)}/h` : "—" },
        ],
      }
    : isManager
      ? {
          label: "spec // week",
          title: `Week of ${week.start}`,
          rows: [
            { k: "Billable", v: formatCents(data.dashWeek.billable) },
            { k: "Cost", v: formatCents(data.dashWeek.cost) },
            { k: "Margin", v: formatCents(data.dashWeek.margin) },
            { k: "Utilization", v: pct(data.dashWeek.utilizationPct) },
          ],
        }
      : {
          label: "spec // me",
          title: data.myRes?.name ?? ctx.appUser.name ?? "You",
          rows: [
            { k: "Bill rate", v: data.myRes ? `${formatCents(data.myRes.billRate)}/h` : "—" },
            { k: "Cost rate", v: data.myRes ? `${formatCents(data.myRes.costRate)}/h` : "—" },
            { k: "Target util", v: data.myRes?.targetUtilization ? `${data.myRes.targetUtilization}%` : "—" },
          ],
        };

  const burnTitle = isPrincipal ? "Contract burn" : isManager ? "Budget burn by project" : "My projects";

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow={header.eyebrow}
        title={header.title}
        blurb={`${active.entityName} · scoped to this entity. Figures update as time is logged, approved, and invoiced.`}
      />

      <div className="grid grid-cols-2 gap-[13px] lg:grid-cols-4">
        {stats.map((s) => (
          <StatTile key={s.label} label={s.label} value={s.value} accent={s.accent} />
        ))}
      </div>

      <div className="grid gap-[13px] lg:grid-cols-[1.45fr_1fr]">
        <Panel title={burnTitle} right="% of fee">
          {burn.length === 0 ? (
            <div className="px-4 py-6 text-[13px] text-alum-2">
              No fee-based projects with logged time yet.
            </div>
          ) : (
            burn.map((b) => (
              <BurnRow
                key={b.code}
                code={b.code}
                name={b.name}
                figure={b.figure}
                pct={b.pct}
                color={b.pct >= 80 ? "blaze" : "cyan"}
              />
            ))
          )}
        </Panel>

        <div className="flex flex-col gap-[13px]">
          <SpecCard label={specCard.label} title={specCard.title} rows={specCard.rows} />
          <Panel title="Needs attention">
            {attentionTop.length === 0 ? (
              <div className="px-4 py-4 text-[13px] text-alum-2">All clear.</div>
            ) : (
              attentionTop.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 border-b border-dashed border-line px-4 py-3 last:border-0"
                >
                  <span
                    className={`h-[6px] w-[6px] shrink-0 rounded-full ${
                      a.color === "blaze" ? "bg-blaze" : a.color === "acid" ? "bg-acid" : "bg-cyan"
                    }`}
                  />
                  <span className="flex-1 text-[13px] text-alum">{a.text}</span>
                  <span className="font-mono text-[10.5px] tracking-[0.1em] text-alum-2 uppercase">
                    {a.tag}
                  </span>
                </div>
              ))
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
