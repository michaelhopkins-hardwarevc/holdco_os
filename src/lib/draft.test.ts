import { describe, expect, it } from "vitest";
import { draftBlocks, type DraftInputEvent } from "@/lib/draft";

const ev = (
  over: Partial<DraftInputEvent> & { id: string; occurredAt: string },
): DraftInputEvent => ({
  hardness: "hard",
  resolvedProjectId: "p1",
  resolvedClientId: "c1",
  resolutionConfidence: "high",
  ...over,
});

describe("draftBlocks — boundary rule", () => {
  it("splits a day into blocks on a project change and fills the gap to the next", () => {
    const blocks = draftBlocks([
      ev({ id: "a", occurredAt: "2026-07-27T09:00:00Z" }),
      ev({ id: "b", occurredAt: "2026-07-27T09:30:00Z" }),
      ev({
        id: "c",
        occurredAt: "2026-07-27T11:00:00Z",
        resolvedProjectId: "p2",
        resolvedClientId: "c2",
      }),
    ]);

    expect(blocks).toHaveLength(2);
    // Block 1 (p1) extends its end to the start of block 2 (11:00): 2 hours.
    expect(blocks[0]).toMatchObject({
      projectId: "p1",
      hours: 2,
      startAt: "2026-07-27T09:00:00.000Z",
      endAt: "2026-07-27T11:00:00.000Z",
    });
    // Block 2 (p2) is a lone point event -> default 0.5h span.
    expect(blocks[1]).toMatchObject({ projectId: "p2", hours: 0.5 });
  });

  it("closes a block on a large idle gap even for the same project", () => {
    const blocks = draftBlocks([
      ev({ id: "a", occurredAt: "2026-07-27T09:00:00Z" }),
      ev({ id: "b", occurredAt: "2026-07-27T13:00:00Z" }), // 4h gap > 90min
    ]);
    expect(blocks).toHaveLength(2);
    // First block's end is capped by maxFillHours (4h) rather than jumping to 13:00.
    expect(blocks[0].hours).toBe(4);
  });

  it("caps the gap fill at maxFillHours", () => {
    const blocks = draftBlocks(
      [
        ev({ id: "a", occurredAt: "2026-07-27T09:00:00Z" }),
        ev({ id: "b", occurredAt: "2026-07-27T09:10:00Z" }),
        ev({
          id: "c",
          occurredAt: "2026-07-27T18:00:00Z",
          resolvedProjectId: "p2",
        }),
      ],
      { maxFillHours: 3 },
    );
    // Fill is capped at 3h from the last event (09:10) -> 12:10; block spans
    // 09:00->12:10 = 3.17h, rounded to 3.25. Without the cap it would be ~9h.
    expect(blocks[0].hours).toBe(3.25);
  });
});

describe("draftBlocks — confidence + anchor", () => {
  it("labels high when a resolved block has a hard signal, med when all soft, low when unresolved", () => {
    const high = draftBlocks([
      ev({ id: "h", occurredAt: "2026-07-27T09:00:00Z", hardness: "hard" }),
    ]);
    expect(high[0].confidence).toBe("high");

    const med = draftBlocks([
      ev({ id: "s", occurredAt: "2026-07-28T09:00:00Z", hardness: "soft" }),
    ]);
    expect(med[0].confidence).toBe("med");

    const low = draftBlocks([
      ev({
        id: "u",
        occurredAt: "2026-07-29T09:00:00Z",
        hardness: "soft",
        resolvedProjectId: null,
        resolvedClientId: null,
        resolutionConfidence: null,
      }),
    ]);
    expect(low[0].confidence).toBe("low");
    expect(low[0].projectId).toBeNull();
  });

  it("picks the hard event as the block anchor", () => {
    const blocks = draftBlocks([
      ev({
        id: "soft",
        occurredAt: "2026-07-27T09:00:00Z",
        hardness: "soft",
        resolutionConfidence: "low",
      }),
      ev({
        id: "hard",
        occurredAt: "2026-07-27T09:20:00Z",
        hardness: "hard",
        resolutionConfidence: "high",
      }),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].anchorEventId).toBe("hard");
    expect(blocks[0].eventIds).toEqual(["soft", "hard"]);
  });
});

describe("draftBlocks — reconstruction tolerance", () => {
  it("reconstructs a hand-checked day within tolerance", () => {
    // Ryan's day: GermPass morning (3 events), Plow afternoon (2 events).
    const blocks = draftBlocks([
      ev({
        id: "1",
        occurredAt: "2026-07-27T09:00:00Z",
        resolvedProjectId: "germpass",
      }),
      ev({
        id: "2",
        occurredAt: "2026-07-27T10:15:00Z",
        resolvedProjectId: "germpass",
      }),
      ev({
        id: "3",
        occurredAt: "2026-07-27T11:30:00Z",
        resolvedProjectId: "germpass",
      }),
      ev({
        id: "4",
        occurredAt: "2026-07-27T13:30:00Z",
        resolvedProjectId: "plow",
      }),
      ev({
        id: "5",
        occurredAt: "2026-07-27T15:00:00Z",
        resolvedProjectId: "plow",
      }),
    ]);
    expect(blocks.map((b) => b.projectId)).toEqual(["germpass", "plow"]);
    const total = blocks.reduce((s, b) => s + b.hours, 0);
    // GermPass 09:00->13:30 (4.5) + Plow 13:30->15:30 (2.0) = 6.5h for a
    // 09:00-15:00 working day. Hand-check ~5-7h.
    expect(total).toBeGreaterThanOrEqual(5);
    expect(total).toBeLessThanOrEqual(7);
  });
});
