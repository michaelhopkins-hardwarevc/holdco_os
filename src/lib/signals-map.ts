import type { CalendarEvent } from "@/lib/integrations/calendar";

// Turn calendar events into proposed timesheet signals. Deliberately simple and
// explicit before it's clever: match the event subject against a project code
// (high confidence) or name (medium); otherwise fall back to an indirect code.

export type ProjectRef = { id: string; code: string; name: string };
export type IndirectRef = { id: string; code: string; category: string };

export type Proposal = {
  chargeType: "project" | "indirect";
  projectId: string | null;
  phaseId: string | null;
  indirectCodeId: string | null;
  billable: boolean;
  confidence: "high" | "med" | "low";
  learned?: boolean;
};

// A learned rule's target, keyed by normalized subject.
export type RuleCharge = {
  chargeType: "project" | "indirect";
  projectId: string | null;
  phaseId: string | null;
  indirectCodeId: string | null;
};

/** Normalize a subject for exact-match rule lookup: lowercase, collapse space. */
export function normalizeSubject(subject: string): string {
  return subject.toLowerCase().replace(/\s+/g, " ").trim();
}

export type MappedSignal = {
  workDate: string;
  externalId: string;
  evidence: string;
  provenance: string;
  chargeType: "project" | "indirect";
  projectId: string | null;
  phaseId: string | null;
  indirectCodeId: string | null;
  proposedHours: string;
  confidence: "high" | "med" | "low";
  billable: boolean;
};

/** Event duration in hours, rounded to the nearest 0.25 (0 if invalid). */
export function durationHours(startISO: string, endISO: string): number {
  const ms = Date.parse(endISO) - Date.parse(startISO);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round((ms / 3_600_000) * 4) / 4;
}

export function mapSubjectToProposal(
  subject: string,
  opts: {
    projects: ProjectRef[];
    indirectCodes: IndirectRef[];
    rules?: Record<string, RuleCharge>;
  },
): Proposal {
  // A learned rule (an exact subject you've charged before) wins.
  const rule = opts.rules?.[normalizeSubject(subject)];
  if (rule) {
    return {
      chargeType: rule.chargeType,
      projectId: rule.projectId,
      phaseId: rule.phaseId,
      indirectCodeId: rule.indirectCodeId,
      billable: rule.chargeType === "project",
      confidence: "high",
      learned: true,
    };
  }

  const s = subject.toLowerCase();
  const byCode = opts.projects.find(
    (p) => p.code && s.includes(p.code.toLowerCase()),
  );
  if (byCode) {
    return {
      chargeType: "project",
      projectId: byCode.id,
      phaseId: null,
      indirectCodeId: null,
      billable: true,
      confidence: "high",
    };
  }
  const byName = opts.projects.find(
    (p) => p.name && p.name.length >= 4 && s.includes(p.name.toLowerCase()),
  );
  if (byName) {
    return {
      chargeType: "project",
      projectId: byName.id,
      phaseId: null,
      indirectCodeId: null,
      billable: true,
      confidence: "med",
    };
  }
  const preferred = ["admin", "overhead", "business_dev", "training"];
  const ind =
    opts.indirectCodes.find((c) => preferred.includes(c.category)) ??
    opts.indirectCodes[0];
  return {
    chargeType: "indirect",
    projectId: null,
    phaseId: null,
    indirectCodeId: ind?.id ?? null,
    billable: false,
    confidence: "low",
  };
}

/** Map a batch of calendar events into signal drafts, dropping ones that
 *  shouldn't propose time (all-day, free/out-of-office, zero-length, or an
 *  indirect fallback with no indirect code to charge to). */
export function eventsToSignals(
  events: CalendarEvent[],
  opts: {
    projects: ProjectRef[];
    indirectCodes: IndirectRef[];
    rules?: Record<string, RuleCharge>;
  },
): MappedSignal[] {
  const out: MappedSignal[] = [];
  for (const e of events) {
    if (e.isAllDay) continue;
    if (["free", "oof", "workingElsewhere"].includes(e.showAs)) continue;
    const hours = durationHours(e.startISO, e.endISO);
    if (hours <= 0) continue;
    const subject = e.subject.trim() || "Busy";
    const prop = mapSubjectToProposal(subject, opts);
    if (prop.chargeType === "indirect" && !prop.indirectCodeId) continue;
    out.push({
      workDate: e.startISO.slice(0, 10),
      externalId: e.id,
      evidence: subject,
      provenance: `${hours} h · ${e.attendees} attendee${e.attendees === 1 ? "" : "s"}${prop.learned ? " · learned" : ""}`,
      chargeType: prop.chargeType,
      projectId: prop.projectId,
      phaseId: prop.phaseId,
      indirectCodeId: prop.indirectCodeId,
      proposedHours: hours.toFixed(2),
      confidence: prop.confidence,
      billable: prop.billable,
    });
  }
  return out;
}
