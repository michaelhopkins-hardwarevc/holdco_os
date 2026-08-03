import { describe, expect, it } from "vitest";
import { weekExceptions, weekUtilization } from "@/lib/approvals";

describe("weekExceptions", () => {
  it("is clean for a full, on-target week", () => {
    expect(
      weekExceptions({ totalHours: 42, billableHours: 34, targetPct: 75, weekdaysWithHours: 5 }),
    ).toEqual([]);
  });
  it("flags under 40", () => {
    expect(
      weekExceptions({ totalHours: 31, billableHours: 25, targetPct: 75, weekdaysWithHours: 5 }),
    ).toContain("UNDER 40");
  });
  it("flags over 45", () => {
    expect(
      weekExceptions({ totalHours: 48, billableHours: 40, targetPct: 75, weekdaysWithHours: 5 }),
    ).toContain("OVER 45");
  });
  it("flags a gap day", () => {
    expect(
      weekExceptions({ totalHours: 40, billableHours: 34, targetPct: 75, weekdaysWithHours: 4 }),
    ).toContain("GAP DAY");
  });
  it("flags low utilization more than 10 points under target", () => {
    // 20/40 = 50%, target 75 -> below 65
    expect(
      weekExceptions({ totalHours: 40, billableHours: 20, targetPct: 75, weekdaysWithHours: 5 }),
    ).toContain("LOW UTIL");
  });
});

describe("weekUtilization", () => {
  it("computes billable share and guards zero", () => {
    expect(weekUtilization(30, 40)).toBe(75);
    expect(weekUtilization(0, 0)).toBeNull();
  });
});
