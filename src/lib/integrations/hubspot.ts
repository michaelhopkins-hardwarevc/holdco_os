import type { CaptureSource, RawActivity } from "./capture";

// HubSpot capture via the CRM v3 activity objects (notes, calls, emails,
// meetings) — the current API, replacing the deprecated engagements v1.
// Each is a hard signal of customer work; an associated deal resolves to a
// project via crosswalk_project. Read-only, via a Service Key (Bearer token).

// The activity object types we capture, mapped to their v3 collection name.
export const HUBSPOT_ACTIVITY_KINDS = {
  note: "notes",
  call: "calls",
  email: "emails",
  meeting: "meetings",
} as const;
export type HubspotKind = keyof typeof HUBSPOT_ACTIVITY_KINDS;

type HubspotV3Record = {
  id: string | number;
  properties?: { hs_timestamp?: string; hubspot_owner_id?: string | number };
  associations?: { deals?: { results?: { id?: string | number }[] } };
};

/** Map a batch of v3 activity records of one kind to RawActivity. */
export function hubspotV3ToActivities(
  records: HubspotV3Record[],
  kind: HubspotKind,
): RawActivity[] {
  return records.map((r) => {
    const dealId = r.associations?.deals?.results?.[0]?.id;
    return {
      sourceSystem: "hubspot",
      sourceUserId:
        r.properties?.hubspot_owner_id != null
          ? String(r.properties.hubspot_owner_id)
          : "",
      sourceEventId: String(r.id),
      eventType: `hubspot_${kind}`,
      occurredAt: r.properties?.hs_timestamp ?? "",
      hardness: "hard",
      hubspotDealId: dealId != null ? String(dealId) : null,
      raw: r,
    };
  });
}

/** A CaptureSource over HubSpot v3 activities (Service Key as Bearer token).
 *  Pulls each activity kind with its deal association and filters to the window
 *  by hs_timestamp. Validate response shape against live data before enabling. */
export function hubspotSource(): CaptureSource {
  return {
    sourceSystem: "hubspot",
    async fetch(accessToken, startISO, endISO) {
      const from = Date.parse(startISO);
      const to = Date.parse(endISO);
      const out: RawActivity[] = [];
      for (const [kind, collection] of Object.entries(HUBSPOT_ACTIVITY_KINDS)) {
        const params = new URLSearchParams({
          properties: "hs_timestamp,hubspot_owner_id",
          associations: "deals",
          limit: "100",
          archived: "false",
        });
        const res = await fetch(
          `https://api.hubapi.com/crm/v3/objects/${collection}?${params}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(
            `HubSpot v3 ${collection} failed (${res.status}): ${text}`,
          );
        }
        const json = (await res.json()) as { results?: HubspotV3Record[] };
        const mapped = hubspotV3ToActivities(
          json.results ?? [],
          kind as HubspotKind,
        ).filter((a) => {
          const ts = Date.parse(a.occurredAt);
          return Number.isFinite(ts) && ts >= from && ts < to;
        });
        out.push(...mapped);
      }
      return out;
    },
  };
}
