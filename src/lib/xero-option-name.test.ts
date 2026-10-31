import { describe, expect, it } from "vitest";
import {
  MAX_OPTION_NAME,
  duplicateNames,
  trackingOptionName,
} from "./xero-option-name";

describe("trackingOptionName", () => {
  it("puts the code first so the list still sorts by number", () => {
    expect(
      trackingOptionName("P-6025", "MicroLumix - 2026 Fractional ID Support"),
    ).toBe("P-6025 MicroLumix - 2026 Fractional ID Support");
  });

  it("keeps a name that is exactly at the limit", () => {
    const desc = "x".repeat(MAX_OPTION_NAME - "P-6025 ".length);
    const name = trackingOptionName("P-6025", desc);
    expect(name).toHaveLength(MAX_OPTION_NAME);
  });

  it("cuts a long description at a word boundary, never mid-word", () => {
    // 70 characters in full.
    expect(
      trackingOptionName(
        "P-5993",
        "Brown Dog Gadgets - Coin Cell Housing Design, Prototype and DFM",
      ),
    ).toBe("P-5993 Brown Dog Gadgets - Coin Cell Housing");
  });

  it("never exceeds Xero's limit, whatever it is given", () => {
    for (const desc of [
      "FTA Charlotte - Motorsports Collectable Figure Platform - Pilot Program",
      "a ".repeat(200),
      "single-enormous-token".repeat(20),
    ]) {
      expect(trackingOptionName("P-6022", desc).length).toBeLessThanOrEqual(
        MAX_OPTION_NAME,
      );
    }
  });

  it("leaves no trailing separator behind after cutting", () => {
    const name = trackingOptionName(
      "P-6022",
      "FTA Charlotte - Motorsports Collectable - Pilot Program",
    );
    expect(name).not.toMatch(/[\s,\-–:;]$/);
  });

  it("returns the bare code when there is no description", () => {
    expect(trackingOptionName("P-6031", "")).toBe("P-6031");
    expect(trackingOptionName("P-6031", null)).toBe("P-6031");
  });

  it("does not repeat the code when the description already starts with it", () => {
    expect(
      trackingOptionName("P-5620-L", "P-5620-L Soliton Jet Development"),
    ).toBe("P-5620-L Soliton Jet Development");
  });

  it("trims and collapses whitespace in the source data", () => {
    expect(trackingOptionName("  P-6002 ", "  Canoe   Claw  ")).toBe(
      "P-6002 Canoe Claw",
    );
  });

  it("keeps a code that is itself over the limit from overflowing", () => {
    const code = "P-" + "9".repeat(80);
    expect(trackingOptionName(code, "Something").length).toBe(MAX_OPTION_NAME);
  });

  it("is idempotent: renaming an already-renamed option changes nothing", () => {
    const once = trackingOptionName(
      "P-6025",
      "MicroLumix - 2026 Fractional ID Support",
    );
    expect(trackingOptionName("P-6025", once)).toBe(once);
  });
});

describe("duplicateNames", () => {
  it("finds names that would collide after truncation", () => {
    // Same code cannot happen, but two projects can share a code in bad data.
    expect(duplicateNames(["P-6025 A", "P-6025 A", "P-6026 B"])).toEqual([
      "P-6025 A",
    ]);
  });

  it("compares loosely on case and padding", () => {
    expect(duplicateNames(["P-6025 A", " p-6025 a "])).toEqual(["P-6025 A"]);
  });

  it("returns nothing for a clean list", () => {
    expect(duplicateNames(["P-6025 A", "P-6026 B"])).toEqual([]);
  });
});
