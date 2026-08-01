import { describe, expect, it } from "vitest";
import {
  centsToDollars,
  dollarsToCents,
  dollarsToCentsOrZero,
  formatCents,
} from "@/lib/money";

describe("money helpers", () => {
  it("parses dollars to integer cents", () => {
    expect(dollarsToCents("225")).toBe(22500);
    expect(dollarsToCents("225.50")).toBe(22550);
    expect(dollarsToCents("19.99")).toBe(1999);
    expect(dollarsToCents("1,234.56")).toBe(123456);
    expect(dollarsToCents("$99.99")).toBe(9999);
    expect(dollarsToCents(225)).toBe(22500);
  });

  it("treats empty/invalid as null (or zero)", () => {
    expect(dollarsToCents("")).toBeNull();
    expect(dollarsToCents(null)).toBeNull();
    expect(dollarsToCents("abc")).toBeNull();
    expect(dollarsToCentsOrZero("")).toBe(0);
    expect(dollarsToCentsOrZero("50")).toBe(5000);
  });

  it("round-trips cents to a dollars string", () => {
    expect(centsToDollars(22500)).toBe("225.00");
    expect(centsToDollars(1999)).toBe("19.99");
    expect(centsToDollars(null)).toBe("");
    expect(dollarsToCents(centsToDollars(123456))).toBe(123456);
  });

  it("formats cents for display", () => {
    expect(formatCents(22500)).toBe("$225.00");
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(null)).toBe("—");
  });
});
