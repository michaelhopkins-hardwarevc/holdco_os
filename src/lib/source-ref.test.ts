import { describe, expect, it } from "vitest";
import {
  describeSourceRef,
  parseSourceRef,
  sourceRefOf,
} from "@/lib/source-ref";

describe("sourceRefOf", () => {
  it("prefers the strongest hint: board, then deal, then folder, then domain", () => {
    expect(sourceRefOf({ mondayBoardId: "1", hubspotDealId: "2" })).toBe("monday_board:1");
    expect(sourceRefOf({ hubspotDealId: "2", senderDomain: "acme.com" })).toBe("hubspot_deal:2");
    expect(sourceRefOf({ sharepointFolder: "/Clients/Acme/" })).toBe("sharepoint:/clients/acme");
    expect(sourceRefOf({ senderDomain: "@Acme.COM" })).toBe("email_domain:acme.com");
    expect(sourceRefOf({})).toBeNull();
  });
});

describe("parseSourceRef / describeSourceRef", () => {
  it("round-trips a ref and rejects junk", () => {
    expect(parseSourceRef("monday_board:123")).toEqual({ kind: "monday_board", value: "123" });
    expect(parseSourceRef("email_domain:acme.com")).toEqual({ kind: "email_domain", value: "acme.com" });
    expect(parseSourceRef("nonsense:1")).toBeNull();
    expect(parseSourceRef("monday_board:")).toBeNull();
  });
  it("describes a ref in plain words", () => {
    expect(describeSourceRef("hubspot_deal:9")).toBe("HubSpot deal 9");
    expect(describeSourceRef("email_domain:acme.com")).toBe("email to acme.com");
  });
});
