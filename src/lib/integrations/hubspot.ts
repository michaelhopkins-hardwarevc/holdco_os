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
      const fromMs = Date.parse(startISO);
      const toMs = Date.parse(endISO);
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      };
      const out: RawActivity[] = [];

      for (const [kind, collection] of Object.entries(HUBSPOT_ACTIVITY_KINDS)) {
        // 1. Recent records via search (time-filtered, newest first). The list
        //    endpoint isn't time-ordered, so it would return old records and
        //    miss recent activity — search is the correct way to get "recent".
        const sres = await fetch(
          `https://api.hubapi.com/crm/v3/objects/${collection}/search`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              filterGroups: [
                {
                  filters: [
                    {
                      propertyName: "hs_timestamp",
                      operator: "GTE",
                      value: String(fromMs),
                    },
                  ],
                },
              ],
              sorts: [
                { propertyName: "hs_timestamp", direction: "DESCENDING" },
              ],
              properties: ["hs_timestamp", "hubspot_owner_id"],
              limit: 100,
            }),
          },
        );
        if (!sres.ok) {
          throw new Error(
            `HubSpot v3 ${collection} search failed (${sres.status}): ${await sres.text()}`,
          );
        }
        const sjson = (await sres.json()) as { results?: HubspotV3Record[] };
        let records = (sjson.results ?? []).filter((r) => {
          const ts = Date.parse(r.properties?.hs_timestamp ?? "");
          return Number.isFinite(ts) && ts < toMs;
        });
        if (records.length === 0) continue;

        // 2. Deal associations (search doesn't return them) via the v4 batch API.
        const ares = await fetch(
          `https://api.hubapi.com/crm/v4/associations/${collection}/deals/batch/read`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              inputs: records.map((r) => ({ id: String(r.id) })),
            }),
          },
        );
        if (ares.ok) {
          const ajson = (await ares.json()) as {
            results?: {
              from?: { id?: string | number };
              to?: { toObjectId?: string | number }[];
            }[];
          };
          const dealByRecord = new Map<string, string>();
          for (const a of ajson.results ?? []) {
            const fid = a.from?.id != null ? String(a.from.id) : "";
            const did = a.to?.[0]?.toObjectId;
            if (fid && did != null) dealByRecord.set(fid, String(did));
          }
          records = records.map((r) => {
            const did = dealByRecord.get(String(r.id));
            return did
              ? { ...r, associations: { deals: { results: [{ id: did }] } } }
              : r;
          });
        }

        out.push(...hubspotV3ToActivities(records, kind as HubspotKind));
      }
      return out;
    },
  };
}
