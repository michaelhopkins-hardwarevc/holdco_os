import { describe, expect, it } from "vitest";
import {
  csvDollars,
  marginPct,
  pctFeeUsed,
  toCsv,
  utilizationPct,
} from "@/lib/reports";

describe("marginPct", () => {
  it("computes margin as a percent of billable value", () => {
    // billable 100000, cost 60000 -> 40% margin
    expect(marginPct(100000, 60000)).toBe(40);
  });
  it("handles a negative margin", () => {
    expect(marginPct(100000, 130000)).toBe(-30);
  });
  it("guards divide-by-zero (no billable value)", () => {
    expect(marginPct(0, 5000)).toBeNull();
    expect(marginPct(-1, 5000)).toBeNull();
  });
});

describe("pctFeeUsed", () => {
  it("computes billable value against the contract fee", () => {
    expect(pctFeeUsed(75000, 100000)).toBe(75);
  });
  it("is null when there is no fee (T&M)", () => {
    expect(pctFeeUsed(75000, null)).toBeNull();
    expect(pctFeeUsed(75000, 0)).toBeNull();
  });
});

describe("utilizationPct", () => {
  it("computes billable hours over total hours", () => {
    expect(utilizationPct(30, 40)).toBe(75);
  });
  it("guards divide-by-zero (no hours logged)", () => {
    expect(utilizationPct(0, 0)).toBeNull();
  });
});

describe("toCsv", () => {
  it("joins headers and rows with CRLF", () => {
    const csv = toCsv(["a", "b"], [[1, 2], [3, 4]]);
    expect(csv).toBe("a,b\r\n1,2\r\n3,4");
  });
  it("escapes commas, quotes, and newlines", () => {
    const csv = toCsv(
      ["name", "note"],
      [["Acme, Inc.", 'He said "hi"'], ["Line1\nLine2", null]],
    );
    expect(csv).toBe(
      'name,note\r\n"Acme, Inc.","He said ""hi"""\r\n"Line1\nLine2",',
    );
  });
});

describe("csvDollars", () => {
  it("renders cents as plain dollars", () => {
    expect(csvDollars(123456)).toBe("1234.56");
    expect(csvDollars(null)).toBe("");
  });
});
