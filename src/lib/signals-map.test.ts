import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/lib/integrations/calendar";
import {
  durationHours,
  eventsToSignals,
  mapSubjectToProposal,
  normalizeSubject,
} from "@/lib/signals-map";

const projects = [
  { id: "p1", code: "P-6041", name: "GermPass Development" },
  { id: "p2", code: "P-6055", name: "Plow Platform" },
];
const indirectCodes = [
  { id: "i1", code: "OH", category: "overhead" },
  { id: "i2", code: "ADMIN", category: "admin" },
];

describe("durationHours", () => {
  it("rounds to the nearest quarter hour", () => {
    expect(durationHours("2026-07-27T09:00:00Z", "2026-07-27T10:30:00Z")).toBe(1.5);
    expect(durationHours("2026-07-27T09:00:00Z", "2026-07-27T09:50:00Z")).toBe(0.75);
  });
  it("is zero for invalid or empty ranges", () => {
    expect(durationHours("2026-07-27T10:00:00Z", "2026-07-27T09:00:00Z")).toBe(0);
    expect(durationHours("x", "y")).toBe(0);
  });
});

describe("mapSubjectToProposal", () => {
  it("matches a project code with high confidence", () => {
    const p = mapSubjectToProposal("P-6041 design review", { projects, indirectCodes });
    expect(p).toMatchObject({ chargeType: "project", projectId: "p1", confidence: "high", billable: true });
  });
  it("matches a project name with medium confidence", () => {
    const p = mapSubjectToProposal("Plow Platform sync", { projects, indirectCodes });
    expect(p).toMatchObject({ chargeType: "project", projectId: "p2", confidence: "med" });
  });
  it("falls back to a preferred indirect code, non-billable", () => {
    const p = mapSubjectToProposal("Weekly all-hands", { projects, indirectCodes });
    // First code whose category is preferred (overhead here), non-billable.
    expect(p).toMatchObject({ chargeType: "indirect", indirectCodeId: "i1", billable: false });
  });

  it("prefers a learned rule over the keyword guess", () => {
    const rules = {
      "weekly all-hands": {
        chargeType: "project" as const,
        projectId: "p2",
        phaseId: null,
        indirectCodeId: null,
      },
    };
    const p = mapSubjectToProposal("Weekly All-Hands", {
      projects,
      indirectCodes,
      rules,
    });
    expect(p).toMatchObject({
      chargeType: "project",
      projectId: "p2",
      confidence: "high",
      learned: true,
    });
  });
});

describe("normalizeSubject", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeSubject("  Weekly   All-Hands ")).toBe("weekly all-hands");
  });
});

describe("eventsToSignals", () => {
  const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
    id: "e",
    subject: "Meeting",
    startISO: "2026-07-27T09:00:00Z",
    endISO: "2026-07-27T10:00:00Z",
    attendees: 2,
    isAllDay: false,
    showAs: "busy",
    ...over,
  });

  it("maps busy events and drops all-day / free / zero-length", () => {
    const signals = eventsToSignals(
      [
        ev({ id: "1", subject: "P-6041 review" }),
        ev({ id: "2", isAllDay: true }),
        ev({ id: "3", showAs: "free" }),
        ev({ id: "4", endISO: "2026-07-27T09:00:00Z" }), // zero length
      ],
      { projects, indirectCodes },
    );
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      externalId: "1",
      chargeType: "project",
      projectId: "p1",
      proposedHours: "1.00",
      workDate: "2026-07-27",
    });
  });

  it("drops indirect fallbacks when no indirect code exists", () => {
    const signals = eventsToSignals([ev({ subject: "Random chat" })], {
      projects,
      indirectCodes: [],
    });
    expect(signals).toHaveLength(0);
  });
});
