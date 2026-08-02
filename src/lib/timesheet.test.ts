import { describe, expect, it } from "vitest";
import {
  addWeeks,
  computeAmounts,
  computeWeekTotals,
  deriveWeekStatus,
  getWeek,
  isWeekEditable,
} from "@/lib/timesheet";

describe("getWeek (Monday-start)", () => {
  it("returns the Monday for a mid-week date", () => {
    // 2026-07-29 is a Wednesday.
    const w = getWeek("2026-07-29");
    expect(w.start).toBe("2026-07-27");
    expect(w.end).toBe("2026-08-02");
    expect(w.days).toHaveLength(7);
    expect(w.days[0]).toBe("2026-07-27");
    expect(w.days[6]).toBe("2026-08-02");
  });

  it("keeps a Monday as the start", () => {
    expect(getWeek("2026-07-27").start).toBe("2026-07-27");
  });

  it("puts Sunday in the same (previous Monday) week", () => {
    // 2026-08-02 is a Sunday; its week started Monday 2026-07-27.
    expect(getWeek("2026-08-02").start).toBe("2026-07-27");
  });

  it("crosses month/year boundaries correctly", () => {
    // 2027-01-01 is a Friday; that week's Monday is 2026-12-28.
    expect(getWeek("2027-01-01").start).toBe("2026-12-28");
  });
});

describe("addWeeks", () => {
  it("moves forward and backward by whole weeks", () => {
    expect(addWeeks("2026-07-27", 1)).toBe("2026-08-03");
    expect(addWeeks("2026-07-27", -1)).toBe("2026-07-20");
  });
});

describe("computeAmounts", () => {
  it("bills only billable time; cost always applies", () => {
    expect(computeAmounts({ hours: 8, billable: true, billRate: 22500, costRate: 9000 })).toEqual(
      { billableAmount: 180000, costAmount: 72000 },
    );
  });

  it("never bills non-billable/indirect time", () => {
    expect(computeAmounts({ hours: 8, billable: false, billRate: 22500, costRate: 9000 })).toEqual(
      { billableAmount: 0, costAmount: 72000 },
    );
  });

  it("rounds to whole cents", () => {
    expect(
      computeAmounts({ hours: 1.5, billable: true, billRate: 12345, costRate: 0 })
        .billableAmount,
    ).toBe(18518); // round(18517.5)
  });
});

describe("computeWeekTotals", () => {
  it("totals per day and for the week", () => {
    const totals = computeWeekTotals([
      { date: "2026-07-27", hours: 8, billableAmount: 180000, costAmount: 72000 },
      { date: "2026-07-27", hours: 2, billableAmount: 0, costAmount: 18000 },
      { date: "2026-07-28", hours: 8, billableAmount: 180000, costAmount: 72000 },
    ]);
    expect(totals.perDay["2026-07-27"]).toBe(10);
    expect(totals.perDay["2026-07-28"]).toBe(8);
    expect(totals.totalHours).toBe(18);
    expect(totals.totalBillable).toBe(360000);
    expect(totals.totalCost).toBe(162000);
  });
});

describe("week lock/status", () => {
  it("is editable only when all entries are draft", () => {
    expect(isWeekEditable([])).toBe(true);
    expect(isWeekEditable(["draft", "draft"])).toBe(true);
    expect(isWeekEditable(["draft", "submitted"])).toBe(false);
    expect(isWeekEditable(["approved"])).toBe(false);
  });

  it("derives an overall status", () => {
    expect(deriveWeekStatus([])).toBe("empty");
    expect(deriveWeekStatus(["draft", "draft"])).toBe("draft");
    expect(deriveWeekStatus(["submitted", "submitted"])).toBe("submitted");
    expect(deriveWeekStatus(["draft", "approved"])).toBe("mixed");
  });
});
