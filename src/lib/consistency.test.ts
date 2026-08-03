import { describe, expect, it } from "vitest";
import {
  type Charge,
  chargeKey,
  chargeValue,
  consistencyNudge,
  type PeerCharge,
} from "@/lib/consistency";

const proj = (id: string, ph: string | null = null): Charge => ({
  chargeType: "project",
  projectId: id,
  phaseId: ph,
  indirectCodeId: null,
});
const ind = (id: string): Charge => ({
  chargeType: "indirect",
  projectId: null,
  phaseId: null,
  indirectCodeId: id,
});
const peer = (c: Charge, label = "x"): PeerCharge => ({ charge: c, label });

describe("chargeKey / chargeValue", () => {
  it("groups equal project charges and separates by phase", () => {
    expect(chargeKey(proj("p1", "ph1"))).toBe("project:p1:ph1");
    expect(chargeKey(proj("p1", "ph2"))).not.toBe(chargeKey(proj("p1", "ph1")));
    expect(chargeKey(ind("c1"))).toBe("indirect:c1");
  });
  it("chargeValue matches the accept-form format", () => {
    expect(chargeValue(proj("p1", "ph1"))).toBe("project:p1:ph1");
    expect(chargeValue(ind("c1"))).toBe("indirect:c1");
  });
});

describe("consistencyNudge", () => {
  it("nudges when a strict majority differs from mine (3 of 4)", () => {
    const peers = [
      peer(proj("p1"), "P1"),
      peer(proj("p1"), "P1"),
      peer(proj("p1"), "P1"),
      peer(ind("c9"), "Overhead"),
    ];
    const n = consistencyNudge(chargeKey(ind("c9")), peers);
    expect(n).not.toBeNull();
    expect(n!.agree).toBe(3);
    expect(n!.total).toBe(4);
    expect(n!.label).toBe("P1");
    expect(n!.value).toBe("project:p1:");
  });

  it("stays silent when I already agree with the majority", () => {
    const peers = [peer(proj("p1")), peer(proj("p1")), peer(ind("c9"))];
    expect(consistencyNudge(chargeKey(proj("p1")), peers)).toBeNull();
  });

  it("stays silent on a tie (no strict majority)", () => {
    const peers = [peer(proj("p1")), peer(proj("p1")), peer(ind("c9")), peer(ind("c9"))];
    expect(consistencyNudge(chargeKey(proj("p2")), peers)).toBeNull();
  });

  it("stays silent when only one teammate logged it", () => {
    expect(consistencyNudge(chargeKey(ind("c9")), [peer(proj("p1"))])).toBeNull();
  });

  it("stays silent with no peers", () => {
    expect(consistencyNudge(chargeKey(proj("p1")), [])).toBeNull();
  });
});
