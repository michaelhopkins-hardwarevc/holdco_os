import type { Confidence } from "@/lib/crosswalk-map";
import { describeSourceRef } from "@/lib/source-ref";

// The Draft stage (WIS Day-One §3.3): cluster resolved activity events into
// work blocks with the boundary rule, estimate hours, and score confidence.
// Pure and deterministic so it's exhaustively testable; persistence (turning
// blocks into confirmable signals) lives elsewhere.
//
// Boundary rule (§2 principle 4): the next body of work closes the previous.
// A change of project closes a block; a large idle gap closes a block; a block's
// end otherwise extends to the next block's start, so fuzzy gaps are attributed
// to the surrounding work rather than lost. A lone point event (e.g. a sent
// email) gets a small default span. An event with a real end (a meeting) uses it.
//
// Guardrails: a day never drafts past `maxDayHours` (blocks scale down
// proportionally), and every block carries the events behind it plus a
// plain-language evidence line, so nothing proposed is unexplained.

export type DraftInputEvent = {
  id: string;
  occurredAt: string; // ISO 8601 UTC
  endedAt?: string | null; // real end when the source knows it
  hardness: "hard" | "soft";
  resolvedProjectId: string | null;
  resolvedClientId: string | null;
  // A source_ref_rule can charge an event to indirect time instead.
  resolvedIndirectCodeId?: string | null;
  resolutionConfidence: Confidence | null;
  eventType?: string;
  subject?: string | null;
  counterparty?: string | null;
  sourceRef?: string | null;
};

export type WorkBlock = {
  workDate: string; // YYYY-MM-DD (from the block's first event)
  projectId: string | null;
  clientId: string | null;
  indirectCodeId: string | null; // set when the block is indirect time
  startAt: string; // ISO
  endAt: string; // ISO
  hours: number; // rounded to 0.25
  confidence: Confidence;
  anchorEventId: string; // the strongest event in the block, for evidence
  eventIds: string[];
  evidence: string; // "2 meetings · 3 emails to acme.com · \"Handlebar review\""
  learnHints: string[]; // distinct source refs behind the block
};

export type DraftOptions = {
  // A gap larger than this (minutes) between consecutive same-project events
  // closes the block.
  gapMinutes?: number;
  // Minimum billable span for any block.
  minHours?: number;
  // Default span for an isolated point event when nothing follows it.
  pointHours?: number;
  // Cap on how far a block's end extends to fill a gap to the next block.
  maxFillHours?: number;
  // Hard ceiling on drafted hours in one day; blocks scale down to fit.
  maxDayHours?: number;
};

const DEFAULTS: Required<DraftOptions> = {
  gapMinutes: 90,
  minHours: 0.25,
  pointHours: 0.5,
  maxFillHours: 4,
  maxDayHours: 12,
};

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}
function ms(iso: string): number {
  return Date.parse(iso);
}
function roundQuarter(hours: number): number {
  return Math.max(0, Math.round(hours * 4) / 4);
}

// Rank events so the "anchor" is the most trustworthy: hard over soft, then
// higher resolution confidence, then earliest.
const CONF_RANK: Record<string, number> = { high: 3, med: 2, low: 1 };
function anchorScore(e: DraftInputEvent): number {
  return (
    (e.hardness === "hard" ? 100 : 0) +
    (e.resolutionConfidence ? CONF_RANK[e.resolutionConfidence] * 10 : 0)
  );
}

function blockConfidence(
  events: DraftInputEvent[],
  charged: boolean,
): Confidence {
  if (!charged) return "low";
  return events.some((e) => e.hardness === "hard") ? "high" : "med";
}

// The charge an event resolved to: a project, an indirect code, or nothing.
// Runs split whenever this changes, so a block is always one charge.
function chargeKeyOf(e: DraftInputEvent): string {
  if (e.resolvedProjectId) return `project:${e.resolvedProjectId}`;
  if (e.resolvedIndirectCodeId) return `indirect:${e.resolvedIndirectCodeId}`;
  return "none";
}

/**
 * A plain-language line describing what a block was drafted from, e.g.
 * "2 meetings · 3 emails to acme.com · \"Handlebar review\"". Counts by kind,
 * then the first subject seen. Never exposes message bodies (design contract).
 */
export function composeEvidence(
  events: Pick<DraftInputEvent, "eventType" | "subject" | "counterparty">[],
): string {
  let meetings = 0;
  let emails = 0;
  let monday = 0;
  let hubspot = 0;
  let other = 0;
  const domains = new Set<string>();
  let subject: string | null = null;
  for (const e of events) {
    const t = e.eventType ?? "";
    if (t === "calendar_meeting") meetings++;
    else if (t === "email_sent") emails++;
    else if (t.startsWith("monday")) monday++;
    else if (t.startsWith("hubspot")) hubspot++;
    else other++;
    if (t === "email_sent" && e.counterparty) domains.add(e.counterparty);
    if (!subject && e.subject) subject = e.subject;
  }
  const parts: string[] = [];
  const n = (k: number, one: string, many: string) =>
    `${k} ${k === 1 ? one : many}`;
  if (meetings) parts.push(n(meetings, "meeting", "meetings"));
  if (emails) {
    const to = domains.size > 0 ? ` to ${[...domains].slice(0, 2).join(", ")}` : "";
    parts.push(`${n(emails, "email", "emails")}${to}`);
  }
  if (monday) parts.push(n(monday, "Monday update", "Monday updates"));
  if (hubspot) parts.push(n(hubspot, "HubSpot activity", "HubSpot activities"));
  if (other) parts.push(n(other, "activity", "activities"));
  if (subject) parts.push(`"${subject.slice(0, 60)}"`);
  return parts.join(" · ") || "activity";
}

/** Distinct source refs behind a block, strongest kinds first, capped. */
function learnHintsOf(events: DraftInputEvent[]): string[] {
  const order = ["monday_board", "hubspot_deal", "sharepoint", "email_domain"];
  const refs = [...new Set(events.map((e) => e.sourceRef).filter((r): r is string => !!r))];
  refs.sort((a, b) => order.indexOf(a.split(":")[0]) - order.indexOf(b.split(":")[0]));
  return refs.slice(0, 5);
}

/** Human label of the refs on a block, for the "pick a charge" evidence. */
export function describeHints(hints: string[]): string {
  return hints.map(describeSourceRef).join(", ");
}

/**
 * Cluster one person's activity events into work blocks. Groups by day, then by
 * a run of the same resolved project with no oversized gap, applies the boundary
 * rule for block edges and hours, caps the day, and labels each block with a
 * confidence, a named anchor event, evidence, and learn hints.
 */
export function draftBlocks(
  events: DraftInputEvent[],
  options?: DraftOptions,
): WorkBlock[] {
  const opts = { ...DEFAULTS, ...options };
  const gapMs = opts.gapMinutes * 60_000;
  const fillMs = opts.maxFillHours * 3_600_000;
  const pointMs = opts.pointHours * 3_600_000;

  // Group by day, each day sorted by time.
  const byDay = new Map<string, DraftInputEvent[]>();
  for (const e of events) {
    const d = dayOf(e.occurredAt);
    (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(e);
  }

  const blocks: WorkBlock[] = [];
  for (const day of [...byDay.keys()].sort()) {
    const dayEvents = byDay
      .get(day)!
      .slice()
      .sort((a, b) => ms(a.occurredAt) - ms(b.occurredAt));

    // Split the day into runs: a new run starts on a project change or a gap
    // bigger than gapMs (measured from the previous event's end, if known).
    const runs: DraftInputEvent[][] = [];
    for (const e of dayEvents) {
      const run = runs[runs.length - 1];
      const prev = run?.[run.length - 1];
      const prevEnd = prev
        ? Math.max(ms(prev.occurredAt), prev.endedAt ? ms(prev.endedAt) : 0)
        : 0;
      const sameCharge = prev && chargeKeyOf(prev) === chargeKeyOf(e);
      const smallGap = prev && ms(e.occurredAt) - prevEnd <= gapMs;
      if (run && sameCharge && smallGap) run.push(e);
      else runs.push([e]);
    }

    // Build a block per run; extend each block's end toward the next run's start
    // (capped) so fuzzy gaps attribute to the preceding work.
    const dayBlocks: WorkBlock[] = [];
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      const startMs = ms(run[0].occurredAt);
      const hasRealEnd = run.some((e) => !!e.endedAt);
      // The run's real end: the latest known end, else the last event's time.
      const runEndMs = run.reduce(
        (m, e) => Math.max(m, ms(e.occurredAt), e.endedAt ? ms(e.endedAt) : 0),
        0,
      );
      const nextStart = runs[i + 1]?.[0]?.occurredAt;

      let endMs: number;
      if (nextStart) {
        // Extend to the next block's start, but attribute at most maxFillHours
        // of the idle gap (measured from this run's real end).
        endMs = Math.min(ms(nextStart), runEndMs + fillMs);
      } else {
        endMs = hasRealEnd ? runEndMs : runEndMs + pointMs;
      }
      // Never end before the run's real end; a lone point event still spans.
      endMs = Math.max(
        endMs,
        runEndMs + (run.length === 1 && !hasRealEnd ? pointMs : 0),
      );

      const hours = Math.max(
        opts.minHours,
        roundQuarter((endMs - startMs) / 3_600_000),
      );
      const anchor = run.reduce(
        (best, e) => (anchorScore(e) > anchorScore(best) ? e : best),
        run[0],
      );
      const projectId = run[0].resolvedProjectId;
      const indirectCodeId = projectId ? null : (run[0].resolvedIndirectCodeId ?? null);

      dayBlocks.push({
        workDate: day,
        projectId,
        clientId: run[0].resolvedClientId,
        indirectCodeId,
        startAt: new Date(startMs).toISOString(),
        endAt: new Date(endMs).toISOString(),
        hours,
        confidence: blockConfidence(run, !!(projectId || indirectCodeId)),
        anchorEventId: anchor.id,
        eventIds: run.map((e) => e.id),
        evidence: composeEvidence(run),
        learnHints: learnHintsOf(run),
      });
    }

    // Day cap: a person cannot have worked more than maxDayHours. Scale the
    // day's blocks down proportionally (keeping the minimum span) rather than
    // dropping any, so every block still reaches the confirm step.
    const total = dayBlocks.reduce((s, b) => s + b.hours, 0);
    if (total > opts.maxDayHours && total > 0) {
      const factor = opts.maxDayHours / total;
      for (const b of dayBlocks) {
        b.hours = Math.max(opts.minHours, roundQuarter(b.hours * factor));
      }
    }
    blocks.push(...dayBlocks);
  }
  return blocks;
}
