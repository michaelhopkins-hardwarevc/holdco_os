import { captureActivities, type CaptureSummary } from "@/lib/capture-db";
import type { RawActivity } from "@/lib/integrations/capture";
import type { QueryDb } from "@/lib/queries";
import type { Actor } from "@/lib/timesheet-db";

// The capture orchestrator (WIS Day-One §3.1). Runs each configured source,
// gathers the normalized events, and funnels them through the capture pipeline
// (resolve + store). A source that fails is recorded and skipped — one bad
// connector never blocks the others or the events already gathered.

// A source pre-bound with its token + window, so the orchestrator is trivially
// testable with fakes. The real bindings (env tokens, per-user Graph tokens,
// crosswalked boards) are assembled by the caller.
export type Fetcher = { label: string; run: () => Promise<RawActivity[]> };

export type SyncResult = CaptureSummary & {
  sourcesRun: number;
  errors: string[];
};

export async function runCapture(
  db: QueryDb,
  actor: Actor,
  entityId: string,
  fetchers: Fetcher[],
): Promise<SyncResult> {
  const raws: RawActivity[] = [];
  const errors: string[] = [];

  for (const f of fetchers) {
    try {
      const got = await f.run();
      raws.push(...got);
    } catch (e) {
      errors.push(`${f.label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const summary = await captureActivities(db, actor, entityId, raws);
  return { ...summary, sourcesRun: fetchers.length, errors };
}
