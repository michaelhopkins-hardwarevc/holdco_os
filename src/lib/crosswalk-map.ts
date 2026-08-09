// Resolve a captured work event to a person, a client, and a project using the
// crosswalk tables (WIS Day-One §3 "Resolve"). Deliberately a pure function over
// in-memory crosswalk rows so it is exhaustively testable; the DB glue that
// loads those rows lives in `crosswalk-db.ts`, mirroring signals-map/signals-db.
//
// Strongest-first (§2 principle 3, confidence everywhere): a hard external id
// (Monday board, HubSpot deal) is a High-confidence project match; a folder
// prefix is Med; falling back to a client-only match from an email domain or a
// name variant is Med/Low; no match is unresolved and goes to the queue.

export type Confidence = "high" | "med" | "low";

// The crosswalk rows the resolver reads, narrowed to what it needs.
export type PersonCrosswalk = {
  sourceSystem: string;
  sourceUserId: string;
  resourceId: string;
};

export type PartyCrosswalk = {
  matchType: "email_domain" | "name_variant";
  matchValue: string;
  clientId: string;
};

export type ProjectCrosswalk = {
  projectId: string;
  clientId: string;
  mondayBoardId: string | null;
  sharepointFolder: string | null;
  hubspotDealId: string | null;
};

export type Crosswalks = {
  persons: PersonCrosswalk[];
  parties: PartyCrosswalk[];
  projects: ProjectCrosswalk[];
};

// A captured event normalized across sources. Any subset of the resolution
// hints may be present; the actor (source system + user id) is always known.
export type WorkEvent = {
  sourceSystem: string;
  sourceUserId: string;
  mondayBoardId?: string | null;
  hubspotDealId?: string | null;
  sharepointFolder?: string | null;
  // The counterparty on an email/meeting, used to reach a client when no
  // project id is present.
  senderDomain?: string | null;
  counterpartyName?: string | null;
};

export type Resolution = {
  resourceId: string | null;
  clientId: string | null;
  projectId: string | null;
  confidence: Confidence;
  // Which rule fired, for the evidence line shown at confirm time.
  matchedBy: string;
};

/** Lowercase + trim an email domain for exact matching. Strips a leading "@". */
export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^@/, "");
}

/** Lowercase + collapse whitespace for name-variant matching. */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Normalize a folder path for prefix matching: lowercase, trim, no trailing "/". */
export function normalizeFolder(folder: string): string {
  return folder.trim().toLowerCase().replace(/\/+$/, "");
}

// Resolve the person independently of the project/client. Attribution to a
// person never depends on which client or project an event touches.
function resolvePerson(
  event: WorkEvent,
  persons: PersonCrosswalk[],
): string | null {
  const hit = persons.find(
    (p) =>
      p.sourceSystem === event.sourceSystem &&
      p.sourceUserId === event.sourceUserId,
  );
  return hit?.resourceId ?? null;
}

// Resolve the strongest project match. Returns the crosswalk row and the
// confidence its match type earns, or null when nothing matches.
function resolveProject(
  event: WorkEvent,
  projects: ProjectCrosswalk[],
): { row: ProjectCrosswalk; confidence: Confidence; matchedBy: string } | null {
  // 1. Monday board id — a hard project signal.
  if (event.mondayBoardId) {
    const row = projects.find((p) => p.mondayBoardId === event.mondayBoardId);
    if (row) return { row, confidence: "high", matchedBy: "monday_board" };
  }
  // 2. HubSpot deal id — a hard project signal.
  if (event.hubspotDealId) {
    const row = projects.find((p) => p.hubspotDealId === event.hubspotDealId);
    if (row) return { row, confidence: "high", matchedBy: "hubspot_deal" };
  }
  // 3. SharePoint folder — exact folder is High, a prefix match is Med.
  if (event.sharepointFolder) {
    const folder = normalizeFolder(event.sharepointFolder);
    const exact = projects.find(
      (p) =>
        p.sharepointFolder && normalizeFolder(p.sharepointFolder) === folder,
    );
    if (exact)
      return { row: exact, confidence: "high", matchedBy: "sharepoint_folder" };
    const prefix = projects.find(
      (p) =>
        p.sharepointFolder &&
        folder.startsWith(normalizeFolder(p.sharepointFolder) + "/"),
    );
    if (prefix)
      return {
        row: prefix,
        confidence: "med",
        matchedBy: "sharepoint_folder_prefix",
      };
  }
  return null;
}

// Resolve a client from the counterparty when no project matched. An email
// domain is a stronger customer signal (Med) than a fuzzy name variant (Low).
function resolveParty(
  event: WorkEvent,
  parties: PartyCrosswalk[],
): { clientId: string; confidence: Confidence; matchedBy: string } | null {
  if (event.senderDomain) {
    const domain = normalizeDomain(event.senderDomain);
    const hit = parties.find(
      (p) =>
        p.matchType === "email_domain" &&
        normalizeDomain(p.matchValue) === domain,
    );
    if (hit)
      return {
        clientId: hit.clientId,
        confidence: "med",
        matchedBy: "email_domain",
      };
  }
  if (event.counterpartyName) {
    const name = normalizeName(event.counterpartyName);
    const hit = parties.find(
      (p) =>
        p.matchType === "name_variant" && normalizeName(p.matchValue) === name,
    );
    if (hit)
      return {
        clientId: hit.clientId,
        confidence: "low",
        matchedBy: "name_variant",
      };
  }
  return null;
}

/**
 * Resolve one event against the crosswalks. A project match also fixes the
 * client (the project knows who it bills to). With no project, we still try to
 * reach a client from the counterparty. The person is resolved independently.
 * An event with no project and no client is unresolved (matchedBy "none").
 */
export function resolveEvent(event: WorkEvent, xwalks: Crosswalks): Resolution {
  const resourceId = resolvePerson(event, xwalks.persons);

  const project = resolveProject(event, xwalks.projects);
  if (project) {
    return {
      resourceId,
      clientId: project.row.clientId,
      projectId: project.row.projectId,
      confidence: project.confidence,
      matchedBy: project.matchedBy,
    };
  }

  const party = resolveParty(event, xwalks.parties);
  if (party) {
    return {
      resourceId,
      clientId: party.clientId,
      projectId: null,
      confidence: party.confidence,
      matchedBy: party.matchedBy,
    };
  }

  return {
    resourceId,
    clientId: null,
    projectId: null,
    confidence: "low",
    matchedBy: "none",
  };
}
