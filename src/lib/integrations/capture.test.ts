import { describe, expect, it } from "vitest";
import { domainOf } from "@/lib/integrations/capture";
import { graphMailToActivities } from "@/lib/integrations/graph-mail";
import { hubspotToActivities } from "@/lib/integrations/hubspot";
import { mondayToActivities } from "@/lib/integrations/monday";

describe("domainOf", () => {
  it("extracts and lowercases the domain", () => {
    expect(domainOf("Chris@BioscienceTech.com")).toBe("biosciencetech.com");
  });
  it("returns null for junk", () => {
    expect(domainOf(null)).toBeNull();
    expect(domainOf("no-at-sign")).toBeNull();
    expect(domainOf("trailing@")).toBeNull();
  });
});

describe("graphMailToActivities", () => {
  it("maps a sent email as a hard signal to the first external recipient domain", () => {
    const [a] = graphMailToActivities(
      [
        {
          id: "m1",
          sentDateTime: "2026-07-27T14:00:00Z",
          subject: "Re: GermPass",
          toRecipients: [
            { emailAddress: { address: "me@brooksstevens.com" } },
            { emailAddress: { address: "chris@biosciencetech.com" } },
          ],
        },
      ],
      "entra-ryan-hahn",
      { internalDomains: ["brooksstevens.com"] },
    );
    expect(a).toMatchObject({
      sourceSystem: "microsoft",
      sourceUserId: "entra-ryan-hahn",
      sourceEventId: "m1",
      eventType: "email_sent",
      hardness: "hard",
      senderDomain: "biosciencetech.com",
      occurredAt: "2026-07-27T14:00:00Z",
    });
  });

  it("lands an all-internal email unresolved (no counterparty domain)", () => {
    const [a] = graphMailToActivities(
      [
        {
          id: "m2",
          toRecipients: [
            { emailAddress: { address: "boss@brooksstevens.com" } },
          ],
        },
      ],
      "entra-ryan-hahn",
      { internalDomains: ["brooksstevens.com"] },
    );
    expect(a.senderDomain).toBeNull();
    expect(a.hardness).toBe("hard");
  });
});

describe("mondayToActivities", () => {
  it("maps a status change as hard with its board id", () => {
    const [a] = mondayToActivities([
      {
        id: "log1",
        created_at: "2026-07-28T09:00:00Z",
        creator_id: 42,
        board_id: 6041,
        kind: "status_change",
      },
    ]);
    expect(a).toMatchObject({
      sourceSystem: "monday",
      sourceUserId: "42",
      eventType: "monday_status",
      hardness: "hard",
      mondayBoardId: "6041",
    });
  });

  it("maps a plain update as soft filler", () => {
    const [a] = mondayToActivities([
      {
        id: "log2",
        created_at: "2026-07-28T10:00:00Z",
        creator_id: 42,
        board_id: 6041,
        kind: "update",
      },
    ]);
    expect(a.eventType).toBe("monday_update");
    expect(a.hardness).toBe("soft");
  });
});

describe("hubspotToActivities", () => {
  it("maps a note as hard with its deal id", () => {
    const [a] = hubspotToActivities([
      {
        id: "e1",
        type: "NOTE",
        timestamp: "2026-07-29T12:00:00Z",
        ownerId: 7,
        dealId: 6055,
      },
    ]);
    expect(a).toMatchObject({
      sourceSystem: "hubspot",
      sourceUserId: "7",
      eventType: "hubspot_note",
      hardness: "hard",
      hubspotDealId: "6055",
    });
  });

  it("treats a task as soft filler", () => {
    const [a] = hubspotToActivities([
      {
        id: "e2",
        type: "TASK",
        timestamp: "2026-07-29T13:00:00Z",
        ownerId: 7,
        dealId: null,
      },
    ]);
    expect(a.eventType).toBe("hubspot_task");
    expect(a.hardness).toBe("soft");
    expect(a.hubspotDealId).toBeNull();
  });
});
