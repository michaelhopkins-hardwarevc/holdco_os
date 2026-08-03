import { describe, expect, it } from "vitest";
import { expenseBillableValue } from "@/lib/expenses";

describe("expenseBillableValue", () => {
  it("adds the markup percentage to the cost", () => {
    expect(expenseBillableValue(10000, 10)).toBe(11000);
    expect(expenseBillableValue(10000, 15)).toBe(11500);
    expect(expenseBillableValue(9999, 10)).toBe(10999); // round(10998.9)
  });

  it("returns the cost unchanged when there is no markup", () => {
    expect(expenseBillableValue(10000, 0)).toBe(10000);
    expect(expenseBillableValue(10000, null)).toBe(10000);
    expect(expenseBillableValue(10000, undefined)).toBe(10000);
    expect(expenseBillableValue(10000, "0")).toBe(10000);
  });

  it("parses a string markup", () => {
    expect(expenseBillableValue(10000, "12.5")).toBe(11250);
  });
});
