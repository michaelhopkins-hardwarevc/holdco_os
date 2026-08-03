// Consistency nudge (Signals step 3). When several teammates were in the same
// meeting (matched by the shared calendar id) and most of them logged it to the
// same charge, nudge a person whose charge diverges. It's a suggestion, not a
// rule: mixed charging on one meeting is legitimate, so we only surface it.

export type Charge = {
  chargeType: "project" | "indirect";
  projectId: string | null;
  phaseId: string | null;
  indirectCodeId: string | null;
};

/** A stable identity for a charge, so equal charges group together. */
export function chargeKey(c: Charge): string {
  return c.chargeType === "project"
    ? `project:${c.projectId ?? ""}:${c.phaseId ?? ""}`
    : `indirect:${c.indirectCodeId ?? ""}`;
}

/** The accept-form value string for a charge ("project:pid:phid" | "indirect:cid"). */
export function chargeValue(c: Charge): string {
  return c.chargeType === "project"
    ? `project:${c.projectId ?? ""}:${c.phaseId ?? ""}`
    : `indirect:${c.indirectCodeId ?? ""}`;
}

// How a teammate charged the shared meeting, with a display label.
export type PeerCharge = { charge: Charge; label: string };

export type Nudge = {
  agree: number; // teammates who used the majority charge
  total: number; // teammates who logged this meeting
  label: string; // human label of the majority charge
  value: string; // accept-form value for the majority charge
};

/**
 * Given my current charge for a meeting and how my teammates charged the same
 * meeting, return a nudge when a strict majority of them agree on a *different*
 * charge (and at least two of them agree). Otherwise null.
 */
export function consistencyNudge(myKey: string, peers: PeerCharge[]): Nudge | null {
  if (peers.length === 0) return null;

  const groups = new Map<string, { count: number; label: string; value: string }>();
  for (const p of peers) {
    const key = chargeKey(p.charge);
    const g = groups.get(key) ?? { count: 0, label: p.label, value: chargeValue(p.charge) };
    g.count += 1;
    groups.set(key, g);
  }

  let topKey = "";
  let top = { count: 0, label: "", value: "" };
  for (const [key, g] of groups) {
    if (g.count > top.count) {
      top = g;
      topKey = key;
    }
  }

  // Strict majority of teammates, at least two, and different from mine.
  if (top.count >= 2 && top.count * 2 > peers.length && topKey !== myKey) {
    return { agree: top.count, total: peers.length, label: top.label, value: top.value };
  }
  return null;
}
