// Planning the Xero tracking-option backfill for crosswalk_project.
//
// Each app project carries a code (P-6025). In Xero the same string is an
// option on the "Project" tracking category, and crosswalk_project
// .xero_tracking_option is what the invoice export writes onto each line
// (see src/lib/integrations/xero.ts).
//
// This module is pure: it decides what SHOULD change and why. The script in
// scripts/backfill-xero-crosswalk.ts does the reading and writing, so the
// decisions are testable without a database and the dry run is the same code
// path as the real run.
//
// Two rules make it safe to re-run:
//   - An option Xero does not have is never written. A tracking option the
//     org has not created would be silently dropped on export, which is
//     exactly how the 2025-26 invoice import lost its project data.
//   - An option somebody already set by hand is never overwritten without
//     --force. It is reported as a conflict instead.

export type BackfillProject = {
  id: string;
  code: string;
  name: string;
  clientId: string;
};

export type ExistingCrosswalk = {
  projectId: string;
  xeroTrackingOption: string | null;
};

export type BackfillAction =
  /** No crosswalk row yet: create one pointing at `option`. */
  | {
      kind: "insert";
      projectId: string;
      clientId: string;
      code: string;
      option: string;
    }
  /** Row exists with no option (or --force over a different one): set it. */
  | {
      kind: "update";
      projectId: string;
      code: string;
      option: string;
      from: string | null;
    }
  /** Already correct. Nothing to do. */
  | { kind: "ok"; projectId: string; code: string; option: string }
  /** Someone set a different option deliberately. Left alone. */
  | {
      kind: "conflict";
      projectId: string;
      code: string;
      existing: string;
      option: string;
    }
  /** Xero has no option matching this project code. Nothing written. */
  | { kind: "missing-option"; projectId: string; code: string }
  /** Two app projects share a code, so the mapping is ambiguous. */
  | { kind: "duplicate-code"; projectId: string; code: string };

export type PlanInput = {
  projects: BackfillProject[];
  existing: ExistingCrosswalk[];
  /** Tracking options that actually exist on the Xero category. */
  xeroOptions: string[];
  /**
   * App project code -> Xero tracking option, for engagements the two systems
   * number differently (app P-7001 is Ajera/Xero P-6025). Checked before code
   * equality. Keys and values match loosely on case and padding, but the
   * option still has to exist in `xeroOptions`.
   */
  mapping?: Record<string, string>;
  /** Overwrite an option that differs from the project code. Default false. */
  force?: boolean;
};

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Resolve a project code to the option Xero actually holds. The explicit
 * mapping wins; otherwise the code itself is tried. Either way the result must
 * exist in `xeroOptions`, and Xero's own spelling is returned, because Xero is
 * the system of record for the string we write.
 */
export function resolveOption(
  code: string,
  xeroOptions: string[],
  mapping: Record<string, string> = {},
): string | null {
  const mapped = Object.entries(mapping).find(
    ([k]) => norm(k) === norm(code),
  )?.[1];
  const want = (mapped ?? code).trim();
  const exact = xeroOptions.find((o) => o.trim() === want);
  if (exact) return exact.trim();
  const loose = xeroOptions.find((o) => norm(o) === norm(want));
  return loose ? loose.trim() : null;
}

/**
 * Options we want on the Xero category that are not already there. Compared
 * loosely on case and padding so we never create "P-6025" next to "p-6025",
 * de-duplicated, and returned in the caller's spelling.
 */
export function diffTrackingOptions(want: string[], have: string[]): string[] {
  const present = new Set(have.map(norm));
  const out: string[] = [];
  for (const w of want) {
    const t = w.trim();
    if (!t || present.has(norm(t))) continue;
    present.add(norm(t)); // dedupe within `want` too
    out.push(t);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/** Mapping keys matching no project: a typo, or a project not created yet. */
export function unusedMappingKeys(
  projects: BackfillProject[],
  mapping: Record<string, string>,
): string[] {
  const codes = new Set(projects.map((p) => norm(p.code)));
  return Object.keys(mapping)
    .filter((k) => !codes.has(norm(k)))
    .map((k) => k.trim())
    .sort((a, b) => a.localeCompare(b));
}

export function planXeroCrosswalk({
  projects,
  existing,
  xeroOptions,
  mapping = {},
  force = false,
}: PlanInput): BackfillAction[] {
  const byProject = new Map(existing.map((e) => [e.projectId, e]));

  // Codes claimed by more than one project cannot be mapped unambiguously.
  const codeCounts = new Map<string, number>();
  for (const p of projects) {
    const k = norm(p.code);
    codeCounts.set(k, (codeCounts.get(k) ?? 0) + 1);
  }

  const actions: BackfillAction[] = projects.map((p) => {
    if ((codeCounts.get(norm(p.code)) ?? 0) > 1) {
      return { kind: "duplicate-code", projectId: p.id, code: p.code };
    }

    const option = resolveOption(p.code, xeroOptions, mapping);
    if (!option) {
      return { kind: "missing-option", projectId: p.id, code: p.code };
    }

    const row = byProject.get(p.id);
    if (!row) {
      return {
        kind: "insert",
        projectId: p.id,
        clientId: p.clientId,
        code: p.code,
        option,
      };
    }

    const current = row.xeroTrackingOption;
    if (current === null || current.trim() === "") {
      return {
        kind: "update",
        projectId: p.id,
        code: p.code,
        option,
        from: current,
      };
    }
    if (current.trim() === option) {
      return { kind: "ok", projectId: p.id, code: p.code, option };
    }
    return force
      ? { kind: "update", projectId: p.id, code: p.code, option, from: current }
      : {
          kind: "conflict",
          projectId: p.id,
          code: p.code,
          existing: current,
          option,
        };
  });

  // Stable order so a dry run and the real run print identically.
  return actions.sort(
    (a, b) =>
      a.code.localeCompare(b.code) || a.projectId.localeCompare(b.projectId),
  );
}

export type PlanSummary = Record<BackfillAction["kind"], number> & {
  /** Rows that would be written. */
  writes: number;
  /** Rows a human has to look at before the backfill is complete. */
  needsAttention: number;
  total: number;
};

export function summarizePlan(plan: BackfillAction[]): PlanSummary {
  const s: PlanSummary = {
    insert: 0,
    update: 0,
    ok: 0,
    conflict: 0,
    "missing-option": 0,
    "duplicate-code": 0,
    writes: 0,
    needsAttention: 0,
    total: plan.length,
  };
  for (const a of plan) s[a.kind] += 1;
  s.writes = s.insert + s.update;
  s.needsAttention = s.conflict + s["missing-option"] + s["duplicate-code"];
  return s;
}

/**
 * Project codes with no matching Xero option: the list of options still to be
 * created on the tracking category. Printing this is the fastest way to find
 * out what the org is missing.
 */
export function missingXeroOptions(plan: BackfillAction[]): string[] {
  return plan
    .filter((a) => a.kind === "missing-option")
    .map((a) => a.code.trim())
    .sort((a, b) => a.localeCompare(b));
}
