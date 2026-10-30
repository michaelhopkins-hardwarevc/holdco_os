import { describe, expect, it } from "vitest";
import {
  diffTrackingOptions,
  type BackfillProject,
  type ExistingCrosswalk,
  planXeroCrosswalk,
  summarizePlan,
  unusedMappingKeys,
} from "./xero-crosswalk";

const P = (
  code: string,
  over: Partial<BackfillProject> = {},
): BackfillProject => ({
  id: `proj-${code}`,
  code,
  clientId: `client-${code}`,
  name: code,
  ...over,
});

const X = (projectId: string, option: string | null): ExistingCrosswalk => ({
  projectId,
  xeroTrackingOption: option,
});

describe("planXeroCrosswalk", () => {
  it("inserts a crosswalk row when the project has none and Xero has the option", () => {
    const plan = planXeroCrosswalk({
      projects: [P("P-6025")],
      existing: [],
      xeroOptions: ["P-6025"],
    });
    expect(plan).toEqual([
      {
        kind: "insert",
        projectId: "proj-P-6025",
        clientId: "client-P-6025",
        code: "P-6025",
        option: "P-6025",
      },
    ]);
  });

  it("fills in a row that exists but has no tracking option", () => {
    const plan = planXeroCrosswalk({
      projects: [P("P-6025")],
      existing: [X("proj-P-6025", null)],
      xeroOptions: ["P-6025"],
    });
    expect(plan).toEqual([
      {
        kind: "update",
        projectId: "proj-P-6025",
        code: "P-6025",
        option: "P-6025",
        from: null,
      },
    ]);
  });

  it("is idempotent: a row already pointing at the right option is left alone", () => {
    const plan = planXeroCrosswalk({
      projects: [P("P-6025")],
      existing: [X("proj-P-6025", "P-6025")],
      xeroOptions: ["P-6025"],
    });
    expect(plan).toEqual([
      {
        kind: "ok",
        projectId: "proj-P-6025",
        code: "P-6025",
        option: "P-6025",
      },
    ]);
  });

  it("reports a conflict and does NOT overwrite a different option set by hand", () => {
    const plan = planXeroCrosswalk({
      projects: [P("P-6025")],
      existing: [X("proj-P-6025", "P-9999-LEGACY")],
      xeroOptions: ["P-6025", "P-9999-LEGACY"],
    });
    expect(plan).toEqual([
      {
        kind: "conflict",
        projectId: "proj-P-6025",
        code: "P-6025",
        existing: "P-9999-LEGACY",
        option: "P-6025",
      },
    ]);
  });

  it("overwrites a conflicting option only when force is set", () => {
    const plan = planXeroCrosswalk({
      projects: [P("P-6025")],
      existing: [X("proj-P-6025", "P-9999-LEGACY")],
      xeroOptions: ["P-6025", "P-9999-LEGACY"],
      force: true,
    });
    expect(plan).toEqual([
      {
        kind: "update",
        projectId: "proj-P-6025",
        code: "P-6025",
        option: "P-6025",
        from: "P-9999-LEGACY",
      },
    ]);
  });

  it("never writes an option Xero does not have", () => {
    const plan = planXeroCrosswalk({
      projects: [P("P-6025"), P("P-7777")],
      existing: [],
      xeroOptions: ["P-6025"],
    });
    expect(plan).toContainEqual({
      kind: "missing-option",
      projectId: "proj-P-7777",
      code: "P-7777",
    });
    expect(plan.filter((a) => a.kind === "insert")).toHaveLength(1);
  });

  it("adopts Xero's spelling when the codes differ only by case or padding", () => {
    const plan = planXeroCrosswalk({
      projects: [P(" p-6025 ")],
      existing: [],
      xeroOptions: ["P-6025"],
    });
    expect(plan).toEqual([
      {
        kind: "insert",
        projectId: "proj- p-6025 ",
        clientId: "client- p-6025 ",
        code: " p-6025 ",
        option: "P-6025",
      },
    ]);
  });

  it("flags duplicate project codes instead of guessing which one wins", () => {
    const plan = planXeroCrosswalk({
      projects: [
        P("P-6025", { id: "a", clientId: "c1" }),
        P("P-6025", { id: "b", clientId: "c2" }),
      ],
      existing: [],
      xeroOptions: ["P-6025"],
    });
    expect(plan).toEqual([
      { kind: "duplicate-code", projectId: "a", code: "P-6025" },
      { kind: "duplicate-code", projectId: "b", code: "P-6025" },
    ]);
  });

  it("orders the plan by project code so two runs print the same thing", () => {
    const plan = planXeroCrosswalk({
      projects: [P("P-6030"), P("P-6001"), P("P-6020")],
      existing: [],
      xeroOptions: ["P-6001", "P-6020", "P-6030"],
    });
    expect(plan.map((a) => a.code)).toEqual(["P-6001", "P-6020", "P-6030"]);
  });

  it("ignores crosswalk rows for projects that are not in the list", () => {
    const plan = planXeroCrosswalk({
      projects: [P("P-6025")],
      existing: [X("proj-GONE", "P-0001")],
      xeroOptions: ["P-6025"],
    });
    expect(plan).toHaveLength(1);
    expect(plan[0].kind).toBe("insert");
  });
});

describe("planXeroCrosswalk with an explicit mapping", () => {
  // The app and Ajera number the same engagement differently (app P-7001 is
  // Ajera/Xero P-6025), so code equality is the fallback, not the rule.
  it("maps an app code onto a different Xero option", () => {
    const plan = planXeroCrosswalk({
      projects: [P("P-7001")],
      existing: [],
      xeroOptions: ["P-6025"],
      mapping: { "P-7001": "P-6025" },
    });
    expect(plan).toEqual([
      {
        kind: "insert",
        projectId: "proj-P-7001",
        clientId: "client-P-7001",
        code: "P-7001",
        option: "P-6025",
      },
    ]);
  });

  it("prefers the mapping over an identical code match", () => {
    const plan = planXeroCrosswalk({
      projects: [P("P-6021")],
      existing: [],
      xeroOptions: ["P-6021", "P-6099"],
      mapping: { "P-6021": "P-6099" },
    });
    expect(plan[0]).toMatchObject({ kind: "insert", option: "P-6099" });
  });

  it("still refuses a mapped option Xero does not have", () => {
    const plan = planXeroCrosswalk({
      projects: [P("P-6055")],
      existing: [],
      xeroOptions: ["P-6025"],
      mapping: { "P-6055": "P-6031" },
    });
    expect(plan).toEqual([
      { kind: "missing-option", projectId: "proj-P-6055", code: "P-6055" },
    ]);
  });

  it("matches mapping keys regardless of case or padding", () => {
    const plan = planXeroCrosswalk({
      projects: [P("p-7001 ")],
      existing: [],
      xeroOptions: ["P-6025"],
      mapping: { " P-7001": "p-6025" },
    });
    expect(plan[0]).toMatchObject({ kind: "insert", option: "P-6025" });
  });

  it("falls back to code equality for projects the mapping does not cover", () => {
    const plan = planXeroCrosswalk({
      projects: [P("P-7001"), P("P-6023")],
      existing: [],
      xeroOptions: ["P-6025", "P-6023"],
      mapping: { "P-7001": "P-6025" },
    });
    expect(
      plan.map((a) => [a.code, a.kind === "insert" ? a.option : null]),
    ).toEqual([
      ["P-6023", "P-6023"],
      ["P-7001", "P-6025"],
    ]);
  });

  it("reports a mapping row that matches no project", () => {
    expect(
      unusedMappingKeys([P("P-7001")], {
        "P-7001": "P-6025",
        "P-9999": "P-0001",
      }),
    ).toEqual(["P-9999"]);
  });
});

describe("diffTrackingOptions", () => {
  it("returns only the options Xero is missing", () => {
    expect(
      diffTrackingOptions(["P-6025", "P-6026", "P-6027"], ["P-6026"]),
    ).toEqual(["P-6025", "P-6027"]);
  });

  it("treats case and padding as already present, so no near-duplicates", () => {
    expect(diffTrackingOptions([" p-6025 "], ["P-6025"])).toEqual([]);
  });

  it("de-duplicates within the wanted list", () => {
    expect(diffTrackingOptions(["P-6025", "p-6025", "P-6025"], [])).toEqual([
      "P-6025",
    ]);
  });

  it("ignores blank entries", () => {
    expect(diffTrackingOptions(["", "  ", "P-6025"], [])).toEqual(["P-6025"]);
  });

  it("returns nothing when Xero already has everything", () => {
    expect(diffTrackingOptions(["P-6025"], ["P-6025", "P-6099"])).toEqual([]);
  });
});

describe("summarizePlan", () => {
  it("counts each outcome and reports whether anything would be written", () => {
    const plan = planXeroCrosswalk({
      projects: [P("P-1"), P("P-2"), P("P-3"), P("P-4")],
      existing: [
        X("proj-P-2", null),
        X("proj-P-3", "P-3"),
        X("proj-P-4", "OTHER"),
      ],
      xeroOptions: ["P-1", "P-2", "P-3", "P-4", "OTHER"],
    });
    const s = summarizePlan(plan);
    expect(s).toMatchObject({
      insert: 1,
      update: 1,
      ok: 1,
      conflict: 1,
      "missing-option": 0,
      "duplicate-code": 0,
    });
    expect(s.writes).toBe(2);
    expect(s.needsAttention).toBe(1);
  });

  it("reports no writes for an already-complete backfill", () => {
    const plan = planXeroCrosswalk({
      projects: [P("P-1")],
      existing: [X("proj-P-1", "P-1")],
      xeroOptions: ["P-1"],
    });
    expect(summarizePlan(plan).writes).toBe(0);
  });
});
