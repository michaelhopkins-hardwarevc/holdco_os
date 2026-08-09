import { describe, expect, it } from "vitest";
import {
  type Crosswalks,
  normalizeDomain,
  normalizeFolder,
  normalizeName,
  resolveEvent,
} from "@/lib/crosswalk-map";

// Two projects for two clients, reachable by different external footprints.
const xwalks: Crosswalks = {
  persons: [
    {
      sourceSystem: "microsoft",
      sourceUserId: "entra-ryan",
      resourceId: "r-ryan",
    },
    { sourceSystem: "monday", sourceUserId: "monday-42", resourceId: "r-ryan" },
  ],
  parties: [
    {
      matchType: "email_domain",
      matchValue: "biosciencetech.com",
      clientId: "c-microlumix",
    },
    {
      matchType: "name_variant",
      matchValue: "lemans corporation",
      clientId: "c-lemans",
    },
  ],
  projects: [
    {
      projectId: "p-germpass",
      clientId: "c-microlumix",
      mondayBoardId: "board-6041",
      sharepointFolder: "/clients/microlumix/germpass",
      hubspotDealId: "deal-6041",
    },
    {
      projectId: "p-plow",
      clientId: "c-lemans",
      mondayBoardId: "board-6055",
      sharepointFolder: "/clients/lemans/plow",
      hubspotDealId: null,
    },
  ],
};

describe("normalizers", () => {
  it("normalizes domains, names, and folders", () => {
    expect(normalizeDomain("@BioscienceTech.com ")).toBe("biosciencetech.com");
    expect(normalizeName("  LeMans   Corporation ")).toBe("lemans corporation");
    expect(normalizeFolder("/Clients/MicroLumix/GermPass/")).toBe(
      "/clients/microlumix/germpass",
    );
  });
});

describe("resolveEvent — project matching (strongest first)", () => {
  it("matches a Monday board id with high confidence and fixes the client", () => {
    const r = resolveEvent(
      {
        sourceSystem: "monday",
        sourceUserId: "monday-42",
        mondayBoardId: "board-6055",
      },
      xwalks,
    );
    expect(r).toMatchObject({
      projectId: "p-plow",
      clientId: "c-lemans",
      resourceId: "r-ryan",
      confidence: "high",
      matchedBy: "monday_board",
    });
  });

  it("matches a HubSpot deal id with high confidence", () => {
    const r = resolveEvent(
      {
        sourceSystem: "microsoft",
        sourceUserId: "entra-ryan",
        hubspotDealId: "deal-6041",
      },
      xwalks,
    );
    expect(r).toMatchObject({
      projectId: "p-germpass",
      confidence: "high",
      matchedBy: "hubspot_deal",
    });
  });

  it("matches an exact SharePoint folder with high confidence", () => {
    const r = resolveEvent(
      {
        sourceSystem: "microsoft",
        sourceUserId: "entra-ryan",
        sharepointFolder: "/clients/microlumix/germpass",
      },
      xwalks,
    );
    expect(r).toMatchObject({ projectId: "p-germpass", confidence: "high" });
  });

  it("matches a SharePoint sub-folder by prefix with medium confidence", () => {
    const r = resolveEvent(
      {
        sourceSystem: "microsoft",
        sourceUserId: "entra-ryan",
        sharepointFolder: "/clients/microlumix/germpass/design/rev-b",
      },
      xwalks,
    );
    expect(r).toMatchObject({
      projectId: "p-germpass",
      confidence: "med",
      matchedBy: "sharepoint_folder_prefix",
    });
  });

  it("prefers a hard id over a folder when both are present", () => {
    const r = resolveEvent(
      {
        sourceSystem: "microsoft",
        sourceUserId: "entra-ryan",
        mondayBoardId: "board-6055", // Plow
        sharepointFolder: "/clients/microlumix/germpass", // GermPass
      },
      xwalks,
    );
    expect(r.projectId).toBe("p-plow");
    expect(r.matchedBy).toBe("monday_board");
  });
});

describe("resolveEvent — client-only fallback", () => {
  it("reaches a client from the sender's email domain (medium)", () => {
    const r = resolveEvent(
      {
        sourceSystem: "microsoft",
        sourceUserId: "entra-ryan",
        senderDomain: "biosciencetech.com",
      },
      xwalks,
    );
    expect(r).toMatchObject({
      clientId: "c-microlumix",
      projectId: null,
      confidence: "med",
      matchedBy: "email_domain",
    });
  });

  it("reaches a client from a name variant (low)", () => {
    const r = resolveEvent(
      {
        sourceSystem: "microsoft",
        sourceUserId: "entra-ryan",
        counterpartyName: "LeMans Corporation",
      },
      xwalks,
    );
    expect(r).toMatchObject({
      clientId: "c-lemans",
      projectId: null,
      confidence: "low",
      matchedBy: "name_variant",
    });
  });

  it("prefers a project match over a client-only party match", () => {
    const r = resolveEvent(
      {
        sourceSystem: "microsoft",
        sourceUserId: "entra-ryan",
        hubspotDealId: "deal-6041",
        senderDomain: "biosciencetech.com",
      },
      xwalks,
    );
    expect(r.projectId).toBe("p-germpass");
    expect(r.matchedBy).toBe("hubspot_deal");
  });
});

describe("resolveEvent — person and unresolved", () => {
  it("resolves the person independently of the charge", () => {
    const r = resolveEvent(
      { sourceSystem: "microsoft", sourceUserId: "entra-ryan" },
      xwalks,
    );
    expect(r.resourceId).toBe("r-ryan");
    expect(r.projectId).toBeNull();
    expect(r.clientId).toBeNull();
    expect(r.matchedBy).toBe("none");
  });

  it("leaves the person null when the actor is unknown", () => {
    const r = resolveEvent(
      {
        sourceSystem: "microsoft",
        sourceUserId: "entra-stranger",
        mondayBoardId: "board-6041",
      },
      xwalks,
    );
    expect(r.resourceId).toBeNull();
    // ...but the hard project signal still resolves.
    expect(r.projectId).toBe("p-germpass");
  });

  it("returns fully unresolved when nothing matches", () => {
    const r = resolveEvent(
      {
        sourceSystem: "monday",
        sourceUserId: "nobody",
        mondayBoardId: "board-9999",
      },
      xwalks,
    );
    expect(r).toMatchObject({
      resourceId: null,
      clientId: null,
      projectId: null,
      matchedBy: "none",
    });
  });
});
