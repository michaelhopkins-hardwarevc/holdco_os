import { and, count, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { runWithUser } from "@/db/rls";
import { client, project, resource, timeEntry } from "@/db/schema";
import { resolveActiveEntity } from "@/lib/active-entity";
import { requireContext } from "@/lib/auth";

export default async function DashboardPage() {
  const ctx = await requireContext();
  const active = await resolveActiveEntity(ctx.memberships);

  if (!active) {
    return (
      <div className="flex flex-col items-start gap-4">
        <h1 className="text-2xl font-semibold">Welcome to HoldCo OS</h1>
        <p className="text-muted-foreground">
          You&apos;re not a member of any entity yet. Create your first entity
          to get started — you&apos;ll become its owner.
        </p>
        <Link href="/entities" className={buttonVariants()}>
          Create your first entity
        </Link>
      </div>
    );
  }

  // Counts are read THROUGH row-level security and scoped to the active entity,
  // demonstrating that lists only ever show the selected entity's data.
  const [counts] = await runWithUser(ctx.authUser.id, async (tx) => {
    const one = (table: typeof client | typeof project | typeof resource) =>
      tx
        .select({ n: count() })
        .from(table)
        .where(and(eq(table.entityId, active.entityId), isNull(table.deletedAt)));

    const [clients] = await one(client);
    const [projects] = await one(project);
    const [resources] = await one(resource);
    const [entries] = await tx
      .select({ n: count() })
      .from(timeEntry)
      .where(
        and(
          eq(timeEntry.entityId, active.entityId),
          isNull(timeEntry.deletedAt),
        ),
      );
    return [
      {
        clients: clients.n,
        projects: projects.n,
        resources: resources.n,
        timeEntries: entries.n,
      },
    ];
  });

  const cards = [
    { label: "Clients", value: counts.clients },
    { label: "Projects", value: counts.projects },
    { label: "Resources", value: counts.resources },
    { label: "Time entries", value: counts.timeEntries },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{active.entityName}</h1>
        <p className="text-muted-foreground">
          Your role: {active.role}. All figures below are scoped to this entity.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader>
              <CardDescription>{c.label}</CardDescription>
              <CardTitle className="text-3xl">{c.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
