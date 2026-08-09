import type { CaptureSource, RawActivity } from "./capture";

// HubSpot capture. Engagements (notes, calls, emails, meetings) are hard
// signals of customer work; an associated deal id resolves to a project via
// crosswalk_project, otherwise the company reaches a client via crosswalk_party.

type HubspotEngagement = {
  id: string;
  type?: string; // NOTE | CALL | EMAIL | MEETING | TASK
  timestamp?: string;
  ownerId?: string | number; // HubSpot user id
  dealId?: string | number | null;
  companyDomain?: string | null;
};

// Engagement types we treat as hard signals of real customer work.
const HARD_TYPES = new Set(["NOTE", "CALL", "EMAIL", "MEETING"]);

/** Map HubSpot engagements to RawActivity. */
export function hubspotToActivities(
  engagements: HubspotEngagement[],
): RawActivity[] {
  return engagements.map((e) => {
    const type = (e.type ?? "NOTE").toUpperCase();
    return {
      sourceSystem: "hubspot",
      sourceUserId: e.ownerId != null ? String(e.ownerId) : "",
      sourceEventId: e.id,
      eventType: `hubspot_${type.toLowerCase()}`,
      occurredAt: e.timestamp ?? "",
      hardness: HARD_TYPES.has(type) ? "hard" : "soft",
      hubspotDealId: e.dealId != null ? String(e.dealId) : null,
      senderDomain: e.companyDomain ?? null,
      raw: e,
    };
  });
}

/** A CaptureSource over the HubSpot API (live token wired per sequencing). */
export function hubspotSource(): CaptureSource {
  return {
    sourceSystem: "hubspot",
    async fetch(accessToken, startISO, endISO) {
      const res = await fetch(
        "https://api.hubapi.com/engagements/v1/engagements/paged?limit=250",
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HubSpot API failed (${res.status}): ${text}`);
      }
      const json = (await res.json()) as {
        results?: {
          engagement?: {
            id: string;
            type?: string;
            timestamp?: number;
            ownerId?: number;
          };
          associations?: { dealIds?: number[] };
        }[];
      };
      const from = Date.parse(startISO);
      const to = Date.parse(endISO);
      const engagements: HubspotEngagement[] = (json.results ?? [])
        .filter((r) => {
          const ts = r.engagement?.timestamp;
          return ts != null && ts >= from && ts < to;
        })
        .map((r) => ({
          id: String(r.engagement?.id),
          type: r.engagement?.type,
          timestamp: r.engagement?.timestamp
            ? new Date(r.engagement.timestamp).toISOString()
            : undefined,
          ownerId: r.engagement?.ownerId,
          dealId: r.associations?.dealIds?.[0] ?? null,
        }));
      return hubspotToActivities(engagements);
    },
  };
}
