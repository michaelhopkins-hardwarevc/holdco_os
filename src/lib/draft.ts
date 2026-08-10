import type { Confidence } from "@/lib/crosswalk-map";

// The Draft stage (WIS Day-One §3.3): cluster resolved activity events into
// work blocks with the boundary rule, estimate hours, and score confidence.
// Pure and deterministic so it's exhaustively testable; persistence (turning
// blocks into confirmable signals) lives elsewhere.
//
// Boundary rule (§2 principle 4): the next body of work closes the previous.
// A change of project closes a block; a large idle gap closes a block; a block's
// end otherwise extends to the next block's start, so fuzzy gaps are attributed
// to the surrounding work rather than lost. A lone point event (e.g. a sent
// email) gets a small default span.

export type DraftInputEvent = {
  id: string;
  occurredAt: string; // ISO 8601 UTC
  hardness: "hard" | "soft";
  resolvedProjectId: string | null;
  resolvedClientId: string | null;
  resolutionConfidence: Confidence | null;
};

export type WorkBlock = {
  workDate: string; // YYYY-MM-DD (from the block's first event)
  projectId: string | null;
  clientId: string | null;
  startAt: string; // ISO
  endAt: string; // ISO
  hours: number; // rounded to 0.25
  confidence: Confidence;
  anchorEventId: string; // the strongest event in the block, for evidence
  eventIds: string[];
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
};

const DEFAULTS: Required<DraftOptions> = {
  gapMinutes: 90,
  minHours: 0.25,
  pointHours: 0.5,
  maxFillHours: 4,
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
  projectId: string | null,
): Confidence {
  if (!projectId) return "low";
  return events.some((e) => e.hardness === "hard") ? "high" : "med";
}

/**
 * Cluster one person's activity events into work blocks. Groups by day, then by
 * a run of the same resolved project with no oversized gap, applies the boundary
 * rule for block edges and hours, and labels each block with a confidence and a
 * named anchor event.
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
    // bigger than gapMs.
    const runs: DraftInputEvent[][] = [];
    for (const e of dayEvents) {
      const run = runs[runs.length - 1];
      const prev = run?.[run.length - 1];
      const sameProject =
        prev && prev.resolvedProjectId === e.resolvedProjectId;
      const smallGap = prev && ms(e.occurredAt) - ms(prev.occurredAt) <= gapMs;
      if (run && sameProject && smallGap) run.push(e);
      else runs.push([e]);
    }

    // Build a block per run; extend each block's end toward the next run's start
    // (capped) so fuzzy gaps attribute to the preceding work.
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      const startMs = ms(run[0].occurredAt);
      const lastMs = ms(run[run.length - 1].occurredAt);
      const nextStart = runs[i + 1]?.[0]?.occurredAt;

      let endMs: number;
      if (nextStart) {
        // Extend to the next block's start, but attribute at most maxFillHours
        // of the idle gap (measured from this run's last event).
        endMs = Math.min(ms(nextStart), lastMs + fillMs);
      } else {
        endMs = lastMs + pointMs;
      }
      // Never end before the last event; ensure at least a point span.
      endMs = Math.max(endMs, lastMs + (run.length === 1 ? pointMs : 0));

      const hours = Math.max(
        opts.minHours,
        roundQuarter((endMs - startMs) / 3_600_000),
      );
      const anchor = run.reduce(
        (best, e) => (anchorScore(e) > anchorScore(best) ? e : best),
        run[0],
      );
      const projectId = run[0].resolvedProjectId;

      blocks.push({
        workDate: day,
        projectId,
        clientId: run[0].resolvedClientId,
        startAt: new Date(startMs).toISOString(),
        endAt: new Date(endMs).toISOString(),
        hours,
        confidence: blockConfidence(run, projectId),
        anchorEventId: anchor.id,
        eventIds: run.map((e) => e.id),
      });
    }
  }
  return blocks;
}
