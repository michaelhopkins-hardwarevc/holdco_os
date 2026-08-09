import {
  captureActivities,
  type CaptureActor,
  type CaptureSummary,
} from "@/lib/capture-db";
import type { RawActivity } from "@/lib/integrations/capture";
import { graphMailSource } from "@/lib/integrations/graph-mail";
import { hubspotSource } from "@/lib/integrations/hubspot";
import { mondaySource } from "@/lib/integrations/monday";
import type { QueryDb } from "@/lib/queries";

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
  actor: CaptureActor,
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

// --- Fetcher assembly (pure — no db/env/network at import time) -------------

export type CaptureWindow = { startISO: string; endISO: string };

/** A capture window ending "now" and reaching back `days` (with margin so a
 *  daily cron never misses events from a missed run). */
export function pickWindow(nowMs: number, days: number): CaptureWindow {
  return {
    startISO: new Date(nowMs - days * 86_400_000).toISOString(),
    endISO: new Date(nowMs).toISOString(),
  };
}

// A connected Outlook mailbox: its Entra id (the actor) and a lazy fresh-token
// getter (Microsoft rotates tokens, so we fetch one per run).
export type OutlookBinding = {
  entraId: string;
  getToken: () => Promise<string>;
};

export type AssembleInput = {
  window: CaptureWindow;
  mondayToken?: string | null;
  mondayBoardIds: string[];
  hubspotToken?: string | null;
  outlook: OutlookBinding[];
  internalDomains: string[];
};

/**
 * Turn the available tokens/connections into bound fetchers for runCapture.
 * A source is included only when it can actually run: Monday needs a token AND
 * at least one crosswalked board; HubSpot needs its Service Key; Outlook adds
 * one fetcher per connected mailbox.
 */
export function assembleFetchers(input: AssembleInput): Fetcher[] {
  const w = input.window;
  const fetchers: Fetcher[] = [];

  if (input.mondayToken && input.mondayBoardIds.length > 0) {
    const token = input.mondayToken;
    fetchers.push({
      label: "monday",
      run: () =>
        mondaySource(input.mondayBoardIds).fetch(token, w.startISO, w.endISO),
    });
  }
  if (input.hubspotToken) {
    const token = input.hubspotToken;
    fetchers.push({
      label: "hubspot",
      run: () => hubspotSource().fetch(token, w.startISO, w.endISO),
    });
  }
  for (const o of input.outlook) {
    fetchers.push({
      label: `outlook:${o.entraId}`,
      run: async () =>
        graphMailSource(o.entraId, input.internalDomains).fetch(
          await o.getToken(),
          w.startISO,
          w.endISO,
        ),
    });
  }
  return fetchers;
}
