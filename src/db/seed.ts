import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  client,
  contact,
  entity,
  indirectCode,
  membership,
  organization,
  phase,
  project,
  resource,
  timeEntry,
  user,
} from "./schema";

type FullSchema = typeof import("./schema");

// A drizzle db that can run inserts against our schema. Kept broad over the
// query-result type so the same seed runs against Supabase Postgres
// (postgres-js) and the in-process PGlite used by tests.
export type SeedDb = PgDatabase<
  PgQueryResultHKT,
  FullSchema,
  ExtractTablesWithRelations<FullSchema>
>;

export const SAMPLE_ORG_SLUG = "marmik-sample";

// The Monday–Friday of the sample week the time entries fall in.
const WEEK = [
  "2026-07-27",
  "2026-07-28",
  "2026-07-29",
  "2026-07-30",
  "2026-07-31",
];

function cents(hours: number, rate: number): number {
  return Math.round(hours * rate);
}

/**
 * Load one realistic sample design-firm entity. Assumes an empty schema (the
 * runnable script guards against re-seeding; tests use a fresh database).
 * Returns a summary of how many of each record were created.
 */
export async function seed(db: SeedDb) {
  // --- organization + entity ---
  const [org] = await db
    .insert(organization)
    .values({ name: "Marmik HoldCo", slug: SAMPLE_ORG_SLUG })
    .returning({ id: organization.id });

  const [ent] = await db
    .insert(entity)
    .values({
      organizationId: org.id,
      name: "Brooks Stevens Design Associates",
      legalName: "Brooks Stevens, Inc.",
      type: "services",
      status: "active",
      baseCurrency: "USD",
    })
    .returning({ id: entity.id });

  const orgId = org.id;
  const entityId = ent.id;
  const scope = { organizationId: orgId, entityId };

  // --- users + memberships ---
  const users = await db
    .insert(user)
    .values([
      { organizationId: orgId, email: "owner@example.com", name: "Alex Owner" },
      {
        organizationId: orgId,
        email: "manager@example.com",
        name: "Morgan Manager",
      },
      {
        organizationId: orgId,
        email: "staff@example.com",
        name: "Sam Staff",
      },
    ])
    .returning({ id: user.id });

  await db.insert(membership).values([
    { ...scope, userId: users[0].id, role: "owner" },
    { ...scope, userId: users[1].id, role: "manager" },
    { ...scope, userId: users[2].id, role: "staff" },
  ]);

  // --- resources (billable people; rates in cents/hour) ---
  const resources = await db
    .insert(resource)
    .values([
      {
        ...scope,
        userId: users[0].id,
        name: "Jordan Principal",
        title: "Principal",
        billRate: 26500,
        costRate: 12000,
        targetUtilization: "60.00",
      },
      {
        ...scope,
        userId: users[1].id,
        name: "Ryan Hahn",
        title: "Sr. Industrial Design",
        billRate: 22500,
        costRate: 9000,
        targetUtilization: "80.00",
      },
      {
        ...scope,
        name: "Justin Gasal",
        title: "Engineer 2",
        billRate: 20000,
        costRate: 8000,
        targetUtilization: "80.00",
      },
      {
        ...scope,
        name: "Casey Designer",
        title: "Industrial Designer",
        billRate: 18500,
        costRate: 7500,
        targetUtilization: "85.00",
      },
    ])
    .returning({
      id: resource.id,
      billRate: resource.billRate,
      costRate: resource.costRate,
    });

  // --- clients + contacts ---
  const clients = await db
    .insert(client)
    .values([
      { ...scope, name: "MicroLumix (Bioscience Technologies)" },
      { ...scope, name: "LeMans Corporation" },
      { ...scope, name: "J.W. Speaker" },
    ])
    .returning({ id: client.id });

  await db.insert(contact).values([
    {
      ...scope,
      clientId: clients[0].id,
      name: "Chris Hickey",
      email: "chris@example.com",
      role: "Program Lead",
    },
    {
      ...scope,
      clientId: clients[1].id,
      name: "Paul Langley",
      email: "paul@example.com",
      role: "Executive Sponsor",
    },
    {
      ...scope,
      clientId: clients[2].id,
      name: "Dana Lighting",
      email: "dana@example.com",
      role: "Director of Engineering",
    },
  ]);

  // --- projects ---
  const projects = await db
    .insert(project)
    .values([
      {
        ...scope,
        clientId: clients[0].id,
        code: "P-6041",
        name: "GermPass Development",
        type: "time_materials",
        status: "active",
        projectManagerId: users[0].id,
        startDate: "2026-06-01",
      },
      {
        ...scope,
        clientId: clients[1].id,
        code: "P-6055",
        name: "Plow Platform",
        type: "not_to_exceed",
        status: "active",
        contractValue: 12500000, // $125,000.00
        projectManagerId: users[1].id,
        startDate: "2026-07-01",
      },
      {
        ...scope,
        clientId: clients[2].id,
        code: "P-6060",
        name: "Lighting Strategy",
        type: "fixed_fee",
        status: "active",
        contractValue: 7500000, // $75,000.00
        projectManagerId: users[1].id,
        startDate: "2026-07-15",
      },
    ])
    .returning({ id: project.id });

  // --- phases (budget hours as numeric string; budget amount in cents) ---
  const phases = await db
    .insert(phase)
    .values([
      {
        ...scope,
        projectId: projects[0].id,
        name: "Discovery",
        code: "10",
        budgetHours: "120.00",
        budgetAmount: 2500000,
        sortOrder: 1,
      },
      {
        ...scope,
        projectId: projects[0].id,
        name: "Design",
        code: "20",
        budgetHours: "240.00",
        budgetAmount: 5000000,
        sortOrder: 2,
      },
      {
        ...scope,
        projectId: projects[0].id,
        name: "Deliver",
        code: "30",
        budgetHours: "80.00",
        budgetAmount: 1800000,
        sortOrder: 3,
      },
      {
        ...scope,
        projectId: projects[1].id,
        name: "Engineering",
        code: "10",
        budgetHours: "300.00",
        budgetAmount: 6000000,
        sortOrder: 1,
      },
      {
        ...scope,
        projectId: projects[1].id,
        name: "Prototype",
        code: "20",
        budgetHours: "160.00",
        budgetAmount: 3200000,
        sortOrder: 2,
      },
      {
        ...scope,
        projectId: projects[2].id,
        name: "Strategy",
        code: "10",
        budgetHours: "100.00",
        budgetAmount: 3500000,
        sortOrder: 1,
      },
      {
        ...scope,
        projectId: projects[2].id,
        name: "Concepts",
        code: "20",
        budgetHours: "120.00",
        budgetAmount: 4000000,
        sortOrder: 2,
      },
    ])
    .returning({ id: phase.id, projectId: phase.projectId });

  function firstPhaseOf(projectId: string): string {
    return phases.find((p) => p.projectId === projectId)!.id;
  }

  // --- standard indirect codes (the overhead buckets, spec §7.2) ---
  const indirectRows = await db
    .insert(indirectCode)
    .values([
      { ...scope, code: "OH", category: "overhead", description: "Overhead" },
      { ...scope, code: "PTO", category: "pto", description: "Paid time off" },
      { ...scope, code: "HOL", category: "holiday", description: "Holiday" },
      { ...scope, code: "SICK", category: "sick", description: "Sick" },
      {
        ...scope,
        code: "BD",
        category: "business_dev",
        description: "Business development",
      },
      { ...scope, code: "TRN", category: "training", description: "Training" },
      { ...scope, code: "ADMIN", category: "admin", description: "Admin" },
      { ...scope, code: "RND", category: "rnd", description: "R&D" },
    ])
    .returning({ id: indirectCode.id, code: indirectCode.code });

  const indirectByCode = Object.fromEntries(
    indirectRows.map((r) => [r.code, r.id]),
  );

  // --- one week of time entries -------------------------------------------
  // Each row is 8h. Project time is billable; indirect time never is (the DB
  // check constraint enforces that). Cost applies to all time.
  type Plan = {
    resourceIdx: number;
    projectIdx?: number;
    indirect?: string;
    days: number[]; // indices into WEEK
  };
  const plans: Plan[] = [
    { resourceIdx: 0, projectIdx: 0, days: [1, 3] }, // Principal: GermPass Tue/Thu
    { resourceIdx: 0, indirect: "BD", days: [0, 2, 4] }, // Principal: BD Mon/Wed/Fri
    { resourceIdx: 1, projectIdx: 0, days: [0, 1, 2, 3, 4] }, // Ryan: GermPass all week
    { resourceIdx: 2, projectIdx: 1, days: [0, 1, 2, 3] }, // Justin: Plow Mon–Thu
    { resourceIdx: 2, indirect: "PTO", days: [4] }, // Justin: PTO Fri
    { resourceIdx: 3, projectIdx: 2, days: [0, 1, 2, 3] }, // Casey: Lighting Mon–Thu
    { resourceIdx: 3, indirect: "OH", days: [4] }, // Casey: overhead Fri
  ];

  const hours = 8;
  const timeRows = plans.flatMap((plan) =>
    plan.days.map((dayIdx) => {
      const res = resources[plan.resourceIdx];
      const base = {
        ...scope,
        resourceId: res.id,
        workDate: WEEK[dayIdx],
        hours: hours.toFixed(2),
        costRate: res.costRate,
        costAmount: cents(hours, res.costRate),
        status: "submitted" as const,
        createdBy: users[2].id,
      };
      if (plan.projectIdx !== undefined) {
        const projectId = projects[plan.projectIdx].id;
        return {
          ...base,
          chargeType: "project" as const,
          projectId,
          phaseId: firstPhaseOf(projectId),
          billable: true,
          billRate: res.billRate,
          billableAmount: cents(hours, res.billRate),
        };
      }
      return {
        ...base,
        chargeType: "indirect" as const,
        indirectCodeId: indirectByCode[plan.indirect!],
        billable: false,
        billRate: 0,
        billableAmount: 0,
      };
    }),
  );

  await db.insert(timeEntry).values(timeRows);

  return {
    organizations: 1,
    entities: 1,
    users: users.length,
    memberships: users.length,
    resources: resources.length,
    clients: clients.length,
    contacts: clients.length,
    projects: projects.length,
    phases: phases.length,
    indirectCodes: indirectRows.length,
    timeEntries: timeRows.length,
  };
}
