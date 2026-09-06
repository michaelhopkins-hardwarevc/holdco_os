import { normalizeDomain, normalizeFolder } from "@/lib/crosswalk-map";

// A source ref is one token naming the strongest external hint an activity
// event carried: "monday_board:123", "hubspot_deal:456", "sharepoint:/x/y",
// "email_domain:acme.com". Draft rolls the distinct refs of a block into the
// signal's learn hints; a confirm-time correction turns a ref into a crosswalk
// row so the same pattern resolves by itself next time. Pure and testable.

export type SourceRefKind =
  | "monday_board"
  | "hubspot_deal"
  | "sharepoint"
  | "email_domain";

export type SourceRef = { kind: SourceRefKind; value: string };

const KINDS: SourceRefKind[] = [
  "monday_board",
  "hubspot_deal",
  "sharepoint",
  "email_domain",
];

/** The strongest hint on an event, as a token. Null when it carried none. */
export function sourceRefOf(h: {
  mondayBoardId?: string | null;
  hubspotDealId?: string | null;
  sharepointFolder?: string | null;
  senderDomain?: string | null;
}): string | null {
  if (h.mondayBoardId) return `monday_board:${h.mondayBoardId}`;
  if (h.hubspotDealId) return `hubspot_deal:${h.hubspotDealId}`;
  if (h.sharepointFolder) return `sharepoint:${normalizeFolder(h.sharepointFolder)}`;
  if (h.senderDomain) return `email_domain:${normalizeDomain(h.senderDomain)}`;
  return null;
}

export function parseSourceRef(ref: string): SourceRef | null {
  const i = ref.indexOf(":");
  if (i <= 0) return null;
  const kind = ref.slice(0, i) as SourceRefKind;
  const value = ref.slice(i + 1);
  if (!KINDS.includes(kind) || !value) return null;
  return { kind, value };
}

/** Plain-language label for a ref, for the queue and the evidence line. */
export function describeSourceRef(ref: string): string {
  const p = parseSourceRef(ref);
  if (!p) return ref;
  switch (p.kind) {
    case "monday_board":
      return `Monday board ${p.value}`;
    case "hubspot_deal":
      return `HubSpot deal ${p.value}`;
    case "sharepoint":
      return `SharePoint ${p.value}`;
    case "email_domain":
      return `email to ${p.value}`;
  }
}
