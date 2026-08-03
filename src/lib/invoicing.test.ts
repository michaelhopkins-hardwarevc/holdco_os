import { describe, expect, it } from "vitest";
import { agingBucket, daysBetween, invoiceNumber } from "@/lib/invoicing";

describe("agingBucket", () => {
  it("buckets by days since the invoice date", () => {
    expect(agingBucket("2026-08-01", "2026-08-01")).toBe("0-30");
    expect(agingBucket("2026-08-01", "2026-08-31")).toBe("0-30");
    expect(agingBucket("2026-08-01", "2026-09-15")).toBe("31-60"); // 45d
    expect(agingBucket("2026-08-01", "2026-10-15")).toBe("61-90"); // 75d
    expect(agingBucket("2026-08-01", "2026-12-01")).toBe("90+"); // 122d
  });
});

describe("daysBetween", () => {
  it("counts whole days", () => {
    expect(daysBetween("2026-08-01", "2026-08-11")).toBe(10);
    expect(daysBetween("2026-08-11", "2026-08-01")).toBe(-10);
  });
});

describe("invoiceNumber", () => {
  it("zero-pads to 4 digits", () => {
    expect(invoiceNumber(1)).toBe("INV-0001");
    expect(invoiceNumber(42)).toBe("INV-0042");
  });
});
