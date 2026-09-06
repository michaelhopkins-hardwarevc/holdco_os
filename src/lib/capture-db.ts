import { and, eq, isNull } from "drizzle-orm";
import {
  activityEvent,
  project,
  resource,
  signalRule,
  sourceConnection,
  sourceRefRule,
  sourceSystem,
} from "@/db/schema";
import { loadCrosswalks } from "@/lib/crosswalk-db";
import { type PersonCrosswalk, resolveEvent } from "@/lib/crosswalk-map";
import type { RawActivity } from "@/lib/integrations/capture";
import type { QueryDb } from "@/lib/queries";
import {
  mapSubjectToProposal,
  type ProjectRef,
  type RuleCharge,
} from "@/lib/signals-map";
import { sourceRefOf } from "@/lib/source-ref";

/**
 * Microsoft identities need no hand-loaded crosswalk: a connected Outlook
 * mailbox already knows its Entra object id and the app user who owns it, and
 * that user's resource is the person. Returns synthetic person crosswalks for
 * every connected mailbox in the entity, used as a fallback after the real rows.
 */
export async function outlookPersonFallbacks(
  db: QueryDb,
  entityId: string,
): Promise<PersonCrosswalk[]> {
  const rows = await db
    .select({
      entraId: sourceConnection.externalAccountId,
      resourceId: resource.id,
    })
    .from(sourceConnection)
    .innerJoin(
      resource,
      and(
        eq(resource.userId, sourceConnection.userId),
        eq(resource.entityId, sourceConnection.entityId),
        isNull(resource.deletedAt),
      ),
    )
    .where(
      and(
        eq(sourceConnection.entityId, entityId),
        eq(sourceConnection.provider, "outlook"),
        isNull(sourceConnection.deletedAt),
      ),
    );
  return rows
    .filter((r): r is { entraId: string; resourceId: string } => !!r.entraId)
    .map((r) => ({
      sourceSystem: "microsoft",
      sourceUserId: r.entraId,
      resourceId: r.resourceId,
    }));
}

// Capture can run unattended (the daily cron has no signed-in user), so the
// actor id may be null. Otherwise it's the user who triggered "Sync now".
export type CaptureActor = { orgId: string; actorId: string | null };

// The Capture stage (WIS Day-One §3.1/§3.2). Land raw activity events and
// attach a resolution (person / client / project) via the M0 crosswalks. This
// writes ONLY activity_event; it never creates a time_entry or a signal
// (additive — drafting is M2). Idempotent by (entity, source system, source id)
// so re-syncs refresh resolution instead of duplicating.

export type CaptureSummary = {
  captured: number;
  resolvedToProject: number;
  resolvedToClientOnly: number;
  unresolved: number;
  hard: number;
};

/**
 * Capture a batch of normalized events for one entity: resolve each against the
 * crosswalks, then upsert into activity_event. Runs with the service role
 * (writes bypass RLS, like the other server-side writers). Returns a summary
 * that ties out to what landed.
 */
export async function captureActivities(
  db: QueryDb,
  actor: CaptureActor,
  entityId: string,
  raws: RawActivity[],
): Promise<CaptureSummary> {
  const summary: CaptureSummary = {
    captured: 0,
    resolvedToProject: 0,
    resolvedToClientOnly: 0,
    unresolved: 0,
    hard: 0,
  };
  if (raws.length === 0) return summary;

  const xwalks = await loadCrosswalks(db, entityId);
  // Real crosswalk rows win; connected mailboxes fill in Microsoft identities.
  xwalks.persons = [
    ...xwalks.persons,
    ...(await outlookPersonFallbacks(db, entityId)),
  ];

  // For subject->project matching (calendar meetings and other titled events
  // with no hard id): the entity's projects and each resource's learned rules.
  const projectRows = await db
    .select({
      id: project.id,
      code: project.code,
      name: project.name,
      clientId: project.clientId,
      status: project.status,
    })
    .from(project)
    .where(and(eq(project.entityId, entityId), isNull(project.deletedAt)));
  const projects: ProjectRef[] = projectRows.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
  }));
  const clientByProject = new Map(projectRows.map((p) => [p.id, p.clientId]));

  const ruleRows = await db
    .select({
      resourceId: signalRule.resourceId,
      matchValue: signalRule.matchValue,
      chargeType: signalRule.chargeType,
      projectId: signalRule.projectId,
      phaseId: signalRule.phaseId,
      indirectCodeId: signalRule.indirectCodeId,
    })
    .from(signalRule)
    .where(
      and(eq(signalRule.entityId, entityId), isNull(signalRule.deletedAt)),
    );
  const rulesByResource = new Map<string, Record<string, RuleCharge>>();
  for (const rr of ruleRows) {
    const m = rulesByResource.get(rr.resourceId) ?? {};
    m[rr.matchValue] = {
      chargeType: rr.chargeType,
      projectId: rr.projectId,
      phaseId: rr.phaseId,
      indirectCodeId: rr.indirectCodeId,
    };
    rulesByResource.set(rr.resourceId, m);
  }

  // Explicit answers from the queue / confirm corrections: a source ref that
  // a person already placed (project, indirect, or ignore). These win.
  const refRules = new Map(
    (
      await db
        .select()
        .from(sourceRefRule)
        .where(
          and(eq(sourceRefRule.entityId, entityId), isNull(sourceRefRule.deletedAt)),
        )
    ).map((r) => [r.sourceRef, r]),
  );

  // Single-project clients: when an event reaches a client but no project and
  // that client has exactly one active project, that project is the charge.
  const activeProjectsByClient = new Map<string, string[]>();
  for (const p of projectRows) {
    if (p.status !== "active") continue;
    activeProjectsByClient.set(p.clientId, [
      ...(activeProjectsByClient.get(p.clientId) ?? []),
      p.id,
    ]);
  }

  for (const raw of raws) {
    const sourceRef = sourceRefOf(raw);
    const base = resolveEvent(raw, xwalks);
    let projectId = base.projectId;
    let clientId = base.clientId;
    let indirectCodeId: string | null = null;
    let confidence = base.confidence;
    let matchedBy = base.matchedBy;

    const rule = sourceRef ? refRules.get(sourceRef) : undefined;
    if (rule) {
      // A human's explicit answer for this source overrides every guess.
      if (rule.kind === "project" && rule.projectId) {
        projectId = rule.projectId;
        clientId = clientByProject.get(rule.projectId) ?? clientId;
        confidence = "high";
        matchedBy = "rule_project";
      } else if (rule.kind === "indirect" && rule.indirectCodeId) {
        projectId = null;
        indirectCodeId = rule.indirectCodeId;
        confidence = "high";
        matchedBy = "rule_indirect";
      } else if (rule.kind === "ignore") {
        projectId = null;
        clientId = null;
        confidence = "low";
        matchedBy = "ignored";
      }
    }

    // Subject->project fallback: for a titled event the crosswalks couldn't
    // resolve, match the subject against project codes/names and the person's
    // learned rules (the intelligence that used to live in the calendar sync).
    if (!rule && projectId === null && raw.subject && base.resourceId) {
      const prop = mapSubjectToProposal(raw.subject, {
        projects,
        indirectCodes: [],
        rules: rulesByResource.get(base.resourceId),
      });
      if (prop.chargeType === "project" && prop.projectId) {
        projectId = prop.projectId;
        clientId = clientByProject.get(prop.projectId) ?? clientId;
        confidence = prop.confidence;
        matchedBy = prop.learned ? "learned_subject" : "subject";
      }
    }

    // Client known, project not: a client with exactly one active project
    // charges to it (medium confidence; the person still confirms).
    if (!rule && projectId === null && clientId !== null) {
      const only = activeProjectsByClient.get(clientId);
      if (only && only.length === 1) {
        projectId = only[0];
        confidence = "med";
        matchedBy = "client_single_project";
      }
    }

    const resolved =
      projectId !== null || clientId !== null || indirectCodeId !== null;
    const endedAt = raw.endedAt ? new Date(raw.endedAt) : null;
    const subject = raw.subject ?? null;
    const counterparty = raw.senderDomain ?? raw.counterpartyName ?? null;

    await db
      .insert(activityEvent)
      .values({
        organizationId: actor.orgId,
        entityId,
        personId: base.resourceId,
        sourceSystem:
          raw.sourceSystem as (typeof sourceSystem.enumValues)[number],
        sourceEventId: raw.sourceEventId,
        eventType: raw.eventType,
        occurredAt: new Date(raw.occurredAt),
        endedAt,
        hardness: raw.hardness,
        rawPayload: raw.raw,
        subject,
        counterparty,
        sourceRef,
        resolvedProjectId: projectId,
        resolvedClientId: clientId,
        resolvedIndirectCodeId: indirectCodeId,
        resolutionConfidence: resolved ? confidence : null,
        matchedBy,
        createdBy: actor.actorId,
        updatedBy: actor.actorId,
      })
      .onConflictDoUpdate({
        target: [
          activityEvent.entityId,
          activityEvent.sourceSystem,
          activityEvent.sourceEventId,
        ],
        set: {
          personId: base.resourceId,
          eventType: raw.eventType,
          occurredAt: new Date(raw.occurredAt),
          endedAt,
          hardness: raw.hardness,
          rawPayload: raw.raw,
          subject,
          counterparty,
          sourceRef,
          resolvedProjectId: projectId,
          resolvedClientId: clientId,
          resolutionConfidence: resolved ? confidence : null,
          matchedBy,
          updatedBy: actor.actorId,
          updatedAt: new Date(),
        },
      });

    summary.captured += 1;
    if (raw.hardness === "hard") summary.hard += 1;
    if (projectId !== null) summary.resolvedToProject += 1;
    else if (clientId !== null) summary.resolvedToClientOnly += 1;
    else summary.unresolved += 1;
  }

  return summary;
}
