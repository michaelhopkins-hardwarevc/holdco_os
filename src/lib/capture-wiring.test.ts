import { describe, expect, it } from "vitest";
import { assembleFetchers, pickWindow } from "@/lib/capture-sync";

describe("pickWindow", () => {
  it("spans `days` back from now, inclusive of margin", () => {
    const now = Date.parse("2026-08-09T12:00:00Z");
    const w = pickWindow(now, 2);
    expect(w.endISO).toBe("2026-08-09T12:00:00.000Z");
    expect(w.startISO).toBe("2026-08-07T12:00:00.000Z");
  });
});

const WINDOW = {
  startISO: "2026-08-07T00:00:00Z",
  endISO: "2026-08-09T00:00:00Z",
};
const base = {
  window: WINDOW,
  mondayBoardIds: [] as string[],
  outlook: [] as { entraId: string; getToken: () => Promise<string> }[],
  internalDomains: ["brooksstevens.com"],
};

describe("assembleFetchers", () => {
  it("includes Monday only with a token AND at least one board", () => {
    expect(
      assembleFetchers({ ...base, mondayToken: "t", mondayBoardIds: [] }),
    ).toHaveLength(0);
    expect(
      assembleFetchers({ ...base, mondayToken: null, mondayBoardIds: ["b1"] }),
    ).toHaveLength(0);
    const f = assembleFetchers({
      ...base,
      mondayToken: "t",
      mondayBoardIds: ["b1"],
    });
    expect(f.map((x) => x.label)).toEqual(["monday"]);
  });

  it("includes HubSpot only with a token", () => {
    expect(assembleFetchers({ ...base, hubspotToken: null })).toHaveLength(0);
    expect(
      assembleFetchers({ ...base, hubspotToken: "k" }).map((x) => x.label),
    ).toEqual(["hubspot"]);
  });

  it("adds one Outlook fetcher per connected mailbox", () => {
    const f = assembleFetchers({
      ...base,
      outlook: [
        { entraId: "entra-a", getToken: async () => "ta" },
        { entraId: "entra-b", getToken: async () => "tb" },
      ],
    });
    expect(f.map((x) => x.label)).toEqual([
      "outlook:entra-a",
      "outlook:entra-b",
    ]);
  });

  it("combines all configured sources", () => {
    const f = assembleFetchers({
      ...base,
      mondayToken: "t",
      mondayBoardIds: ["b1", "b2"],
      hubspotToken: "k",
      outlook: [{ entraId: "entra-a", getToken: async () => "ta" }],
    });
    expect(f.map((x) => x.label)).toEqual([
      "monday",
      "hubspot",
      "outlook:entra-a",
    ]);
  });
});
