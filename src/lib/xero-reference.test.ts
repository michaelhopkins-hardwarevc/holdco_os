import { describe, expect, it } from "vitest";
import { buildInvoiceReference, formatPeriod } from "./xero-reference";

describe("formatPeriod", () => {
  it("collapses a week inside one month", () => {
    expect(formatPeriod("2026-10-05", "2026-10-09")).toBe("Oct 5-9 2026");
  });

  it("names both months when the week straddles them", () => {
    expect(formatPeriod("2026-09-28", "2026-10-02")).toBe("Sep 28-Oct 2 2026");
  });

  it("names both years when the week straddles them", () => {
    expect(formatPeriod("2026-12-28", "2027-01-01")).toBe(
      "Dec 28 2026-Jan 1 2027",
    );
  });

  it("gives a single day once, not as a range", () => {
    expect(formatPeriod("2026-10-09", "2026-10-09")).toBe("Oct 9 2026");
  });

  it("falls back to whichever end it has", () => {
    expect(formatPeriod("2026-10-09", null)).toBe("Oct 9 2026");
    expect(formatPeriod(null, "2026-10-09")).toBe("Oct 9 2026");
    expect(formatPeriod(null, null)).toBe("");
  });

  it("reads the date as written, not in the local time zone", () => {
    // A naive new Date("2026-01-01") is UTC midnight, which is Dec 31 in
    // Milwaukee. An invoice period must not drift a day.
    expect(formatPeriod("2026-01-01", "2026-01-01")).toBe("Jan 1 2026");
  });

  it("ignores a period that runs backwards rather than inventing a range", () => {
    expect(formatPeriod("2026-10-09", "2026-10-05")).toBe("Oct 9 2026");
  });
});

describe("buildInvoiceReference", () => {
  it("reads code, client, project and period, in that order", () => {
    expect(
      buildInvoiceReference({
        projectCode: "P-6031",
        projectName: "Plow Platform",
        clientName: "LeMans Corporation",
        periodStart: "2026-10-19",
        periodEnd: "2026-10-23",
        invoiceDate: "2026-10-23",
      }),
    ).toBe("P-6031 LeMans Corporation - Plow Platform - Oct 19-23 2026");
  });

  it("does not say the client twice when the project name already carries it", () => {
    expect(
      buildInvoiceReference({
        projectCode: "P-6025",
        projectName: "MicroLumix - 2026 Fractional ID Support",
        clientName: "MicroLumix",
        periodStart: "2026-09-21",
        periodEnd: "2026-09-25",
        invoiceDate: "2026-09-25",
      }),
    ).toBe("P-6025 MicroLumix - 2026 Fractional ID Support - Sep 21-25 2026");
  });

  it("does not say the project twice when the code already carries its name", () => {
    // A tracking option is sometimes written as code plus name, not a bare code.
    expect(
      buildInvoiceReference({
        projectCode: "P-6055 Plow Platform",
        projectName: "Plow Platform",
        clientName: "LeMans Corporation",
        periodStart: "2026-10-19",
        periodEnd: "2026-10-23",
        invoiceDate: null,
      }),
    ).toBe("P-6055 Plow Platform LeMans Corporation - Oct 19-23 2026");
  });

  it("does not say the client twice when the code already carries it", () => {
    // Once the tracking options were renamed to "code + project", the option
    // string itself names the client, so repeating it read badly:
    // "P-6031 LeMans - Plow Platform LeMans Corporation - Sep 1-23 2026".
    expect(
      buildInvoiceReference({
        projectCode: "P-6031 LeMans - Plow Platform",
        projectName: "Plow Platform",
        clientName: "LeMans Corporation",
        periodStart: "2026-09-01",
        periodEnd: "2026-09-23",
        invoiceDate: null,
      }),
    ).toBe("P-6031 LeMans - Plow Platform - Sep 1-23 2026");
  });

  it("falls back to the invoice date when there is no period", () => {
    expect(
      buildInvoiceReference({
        projectCode: "P-6031",
        projectName: "Plow Platform",
        clientName: "LeMans Corporation",
        periodStart: null,
        periodEnd: null,
        invoiceDate: "2026-10-23",
      }),
    ).toBe("P-6031 LeMans Corporation - Plow Platform - Oct 23 2026");
  });

  it("drops the parts it does not have instead of printing gaps", () => {
    expect(
      buildInvoiceReference({
        projectCode: null,
        projectName: null,
        clientName: "LeMans Corporation",
        periodStart: "2026-10-19",
        periodEnd: "2026-10-23",
        invoiceDate: null,
      }),
    ).toBe("LeMans Corporation - Oct 19-23 2026");
  });

  it("returns an empty string when it knows nothing", () => {
    expect(
      buildInvoiceReference({
        projectCode: null,
        projectName: null,
        clientName: null,
        periodStart: null,
        periodEnd: null,
        invoiceDate: null,
      }),
    ).toBe("");
  });

  it("stays inside Xero's 255-character Reference limit", () => {
    const ref = buildInvoiceReference({
      projectCode: "P-6031",
      projectName: "x".repeat(400),
      clientName: "y".repeat(400),
      periodStart: "2026-10-19",
      periodEnd: "2026-10-23",
      invoiceDate: "2026-10-23",
    });
    expect(ref.length).toBeLessThanOrEqual(255);
    // The code and the period are what a human scans for, so they survive.
    expect(ref.startsWith("P-6031 ")).toBe(true);
    expect(ref.endsWith("Oct 19-23 2026")).toBe(true);
  });

  it("trims stray whitespace in the stored names", () => {
    expect(
      buildInvoiceReference({
        projectCode: "  P-6031 ",
        projectName: " Plow Platform  ",
        clientName: " LeMans Corporation ",
        periodStart: "2026-10-19",
        periodEnd: "2026-10-23",
        invoiceDate: null,
      }),
    ).toBe("P-6031 LeMans Corporation - Plow Platform - Oct 19-23 2026");
  });
});
