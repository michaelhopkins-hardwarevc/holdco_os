import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  crosswalkPerson,
  entity,
  resource,
  sourceConnection,
} from "@/db/schema";
import {
  assembleFetchers,
  type Fetcher,
  pickWindow,
  runCapture,
  type SyncResult,
} from "@/lib/capture-sync";
import {
  draftForEntity,
  draftSignalsForResource,
  type DraftSummary,
  type EntityDraftSummary,
} from "@/lib/draft-db";
import { graphCalendarSource } from "@/lib/integrations/graph-calendar";
import { graphMailSource } from "@/lib/integrations/graph-mail";
import {
  freshOutlookAccessToken,
  getOutlookConnection,
} from "@/lib/integrations/outlook-store";

// One sync both captures raw events and drafts them into confirmable signals.
export type SyncEntityResult = SyncResult & { drafted: EntityDraftSummary };

// Wires the real tokens/connections into the capture orchestrator and runs one
// sync for an entity. Called by the daily cron route (unattended, actorId null)
// and by the "Sync now" action (actorId = the manager who clicked).

const INTERNAL_DOMAINS = ["brooksstevens.com"];
const WINDOW_DAYS = 2;

export async function syncEntity(opts?: {
  entityId?: string;
  actorId?: string | null;
}): Promise<SyncEntityResult> {
  const [ent] = opts?.entityId
    ? await db
        .select()
        .from(entity)
        .where(eq(entity.id, opts.entityId))
        .limit(1)
    : await db.select().from(entity).where(isNull(entity.deletedAt)).limit(1);
  if (!ent) throw new Error("No entity to sync.");

  // Monday: our people's user ids, so we capture their activity across ALL
  // boards (unmapped boards land as unresolved drafts to link).
  const mondayPeople = await db
    .select({ id: crosswalkPerson.sourceUserId })
    .from(crosswalkPerson)
    .where(
      and(
        eq(crosswalkPerson.entityId, ent.id),
        eq(crosswalkPerson.sourceSystem, "monday"),
        isNull(crosswalkPerson.deletedAt),
      ),
    );
  const mondayMemberUserIds = [
    ...new Set(mondayPeople.map((r) => r.id).filter((x): x is string => !!x)),
  ];

  // Outlook: one binding per connected mailbox.
  const conns = await db
    .select()
    .from(sourceConnection)
    .where(
      and(
        eq(sourceConnection.entityId, ent.id),
        eq(sourceConnection.provider, "outlook"),
        eq(sourceConnection.status, "connected"),
        isNull(sourceConnection.deletedAt),
      ),
    );
  const outlook = conns
    .filter((c) => c.externalAccountId)
    .map((c) => ({
      entraId: c.externalAccountId as string,
      getToken: () => freshOutlookAccessToken(c),
    }));

  const window = pickWindow(Date.now(), WINDOW_DAYS);
  const actor = { orgId: ent.organizationId, actorId: opts?.actorId ?? null };

  const fetchers = assembleFetchers({
    window,
    mondayToken: process.env.MONDAY_API_TOKEN,
    mondayMemberUserIds,
    hubspotToken: process.env.HUBSPOT_SERVICE_KEY,
    outlook,
    internalDomains: INTERNAL_DOMAINS,
  });

  // Capture raw events, then draft them into confirmable signals over the same
  // window so one sync delivers ready-to-confirm time.
  const capture = await runCapture(db, actor, ent.id, fetchers);
  const drafted = await draftForEntity(db, actor, ent.id, {
    start: window.startISO,
    end: window.endISO,
  });

  return { ...capture, drafted };
}

/**
 * Per-user unified refresh (the "Refresh from Outlook" button): capture this
 * user's own mail + calendar into activity_event, then draft their signals over
 * the range. Replaces the old direct calendar->signal path so meetings flow
 * through the same pipeline (and the same subject-matching) as everything else.
 */
export async function syncUserOutlook(
  entityId: string,
  appUserId: string,
  range: { start: string; end: string },
): Promise<{ drafted: DraftSummary }> {
  const [res] = await db
    .select()
    .from(resource)
    .where(
      and(
        eq(resource.entityId, entityId),
        eq(resource.userId, appUserId),
        isNull(resource.deletedAt),
      ),
    )
    .limit(1);
  if (!res) throw new Error("You don't have a resource in this entity.");

  const conn = await getOutlookConnection(entityId, appUserId);
  if (!conn?.externalAccountId) throw new Error("Outlook is not connected.");
  const token = await freshOutlookAccessToken(conn);
  const entra = conn.externalAccountId;
  const actor = { orgId: res.organizationId, actorId: appUserId };

  const fetchers: Fetcher[] = [
    {
      label: `outlook-mail:${entra}`,
      run: () =>
        graphMailSource(entra, INTERNAL_DOMAINS).fetch(
          token,
          range.start,
          range.end,
        ),
    },
    {
      label: `outlook-calendar:${entra}`,
      run: () =>
        graphCalendarSource(entra).fetch(token, range.start, range.end),
    },
  ];

  await runCapture(db, actor, entityId, fetchers);
  const drafted = await draftSignalsForResource(
    db,
    actor,
    entityId,
    res.id,
    range,
  );
  return { drafted };
}
