import type { WorkEvent } from "@/lib/crosswalk-map";

// Adapter interface for capture sources (CLAUDE.md: integrations behind adapter
// interfaces; the app never hard-codes one vendor's API shape). Each source
// (Graph mail, Monday, HubSpot, ...) maps its native records into RawActivity,
// the one normalized shape the capture pipeline lands and resolves.

export type Hardness = "hard" | "soft";

// A normalized captured event. It is a superset of WorkEvent (the resolver's
// input): the same resolution hints, plus the fields activity_event stores.
export type RawActivity = WorkEvent & {
  // Stable id in the source system — the idempotency key for re-syncs.
  sourceEventId: string;
  // email_sent | monday_status | monday_update | hubspot_note | hubspot_call ...
  eventType: string;
  occurredAt: string; // ISO 8601, UTC
  hardness: Hardness;
  // Free-text subject (e.g. a meeting title), when the source has one. Used by
  // subject->project matching at resolution for sources without a hard id.
  subject?: string | null;
  // The original record, kept for audit/debug (never used as a master copy).
  raw: unknown;
};

export interface CaptureSource {
  readonly sourceSystem: string;
  /** Records overlapping [startISO, endISO), normalized to RawActivity. */
  fetch(
    accessToken: string,
    startISO: string,
    endISO: string,
  ): Promise<RawActivity[]>;
}

/** The domain of an email address, lowercased, or null if unparseable. */
export function domainOf(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return (
    email
      .slice(at + 1)
      .trim()
      .toLowerCase() || null
  );
}
