import { describe, expect, it } from "vitest";
import {
  cell,
  isBlankRow,
  locateHeader,
  mapChargeType,
  mapIndirectCategory,
  mapProjectStatus,
  mapProjectType,
  moneyToCents,
  normalizeHeader,
  parseCsv,
  parseDate,
  parseHours,
  parseTargetUtil,
  parseYesNo,
} from "@/lib/import";

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });
  it("handles quoted fields with commas, quotes, and newlines", () => {
    const csv = 'name,note\r\n"Acme, Inc.","He said ""hi"""\r\n"Line1\nLine2",x';
    expect(parseCsv(csv)).toEqual([
      ["name", "note"],
      ["Acme, Inc.", 'He said "hi"'],
      ["Line1\nLine2", "x"],
    ]);
  });
  it("strips a BOM and does not emit a trailing empty row", () => {
    expect(parseCsv("﻿a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
  it("keeps empty fields", () => {
    expect(parseCsv("a,,c")).toEqual([["a", "", "c"]]);
  });
});

describe("normalizeHeader", () => {
  it("keeps $/%/# as words so labels don't collide", () => {
    expect(normalizeHeader("Billable?")).toBe("billable");
    expect(normalizeHeader("Billable $")).toBe("billable usd");
    expect(normalizeHeader("Project #")).toBe("project num");
    expect(normalizeHeader("Bill Rate ($/hr)")).toBe("bill rate usd hr");
    expect(normalizeHeader("Target Util %")).toBe("target util pct");
  });
});

describe("locateHeader", () => {
  const fields = {
    name: ["employee name", "name"],
    billRate: ["bill rate usd hr", "bill rate"],
  };
  it("skips title rows and maps columns by label", () => {
    const rows = [
      ["Employees", "", ""],
      ["Fill the yellow cells.", "", ""],
      ["Emp ID", "Employee Name", "Bill Rate ($/hr)"],
      ["E001", "Jane", "145"],
    ];
    const loc = locateHeader(rows, fields, ["name", "billRate"]);
    expect(loc?.headerRow).toBe(2);
    expect(cell(rows[3], loc!.index, "name")).toBe("Jane");
    expect(cell(rows[3], loc!.index, "billRate")).toBe("145");
  });
  it("returns null when required columns are missing", () => {
    const rows = [["Foo", "Bar"]];
    expect(locateHeader(rows, fields, ["name", "billRate"])).toBeNull();
  });
});

describe("value mappers", () => {
  it("parseYesNo", () => {
    expect(parseYesNo("Yes")).toBe(true);
    expect(parseYesNo("no")).toBe(false);
    expect(parseYesNo("")).toBe(false);
  });
  it("moneyToCents", () => {
    expect(moneyToCents("145")).toBe(14500);
    expect(moneyToCents("$1,234.56")).toBe(123456);
    expect(moneyToCents("")).toBeNull();
  });
  it("parseHours", () => {
    expect(parseHours("6.5")).toBe(6.5);
    expect(parseHours("-1")).toBeNull();
    expect(parseHours("abc")).toBeNull();
  });
  it("parseTargetUtil treats <=1 as a fraction", () => {
    expect(parseTargetUtil("0.75")).toBe("75.00");
    expect(parseTargetUtil("80")).toBe("80.00");
    expect(parseTargetUtil("")).toBeNull();
  });
  it("mapProjectType", () => {
    expect(mapProjectType("Time & Materials")).toBe("time_materials");
    expect(mapProjectType("Fixed Fee")).toBe("fixed_fee");
    expect(mapProjectType("Nonsense")).toBeNull();
  });
  it("mapProjectStatus defaults to active", () => {
    expect(mapProjectStatus("Active")).toBe("active");
    expect(mapProjectStatus("On Hold")).toBe("on_hold");
    expect(mapProjectStatus("")).toBe("active");
  });
  it("mapIndirectCategory", () => {
    expect(mapIndirectCategory("Overhead")).toBe("overhead");
    expect(mapIndirectCategory("Paid Time Off")).toBe("pto");
    expect(mapIndirectCategory("Business Dev")).toBe("business_dev");
    expect(mapIndirectCategory("???")).toBeNull();
  });
  it("mapChargeType", () => {
    expect(mapChargeType("Project")).toBe("project");
    expect(mapChargeType("Indirect")).toBe("indirect");
    expect(mapChargeType("weird")).toBeNull();
  });
  it("parseDate accepts ISO and US formats", () => {
    expect(parseDate("2026-08-04")).toBe("2026-08-04");
    expect(parseDate("8/4/2026")).toBe("2026-08-04");
    expect(parseDate("")).toBeNull();
    expect(parseDate("not a date")).toBeNull();
  });
});

describe("isBlankRow", () => {
  it("detects fully-empty rows", () => {
    expect(isBlankRow(["", "  ", ""])).toBe(true);
    expect(isBlankRow(["", "x"])).toBe(false);
  });
});
