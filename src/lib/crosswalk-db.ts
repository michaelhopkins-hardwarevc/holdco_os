import { and, eq, isNull } from "drizzle-orm";
import { crosswalkParty, crosswalkPerson, crosswalkProject } from "@/db/schema";
import type { Crosswalks } from "@/lib/crosswalk-map";
import type { QueryDb } from "@/lib/queries";

// Load the crosswalk rows for an entity and shape them for the resolver
// (crosswalk-map). Kept as a thin, entity-scoped read so it runs inside
// runWithUser() under RLS, exactly like the other loaders in queries.ts.
export async function loadCrosswalks(
  db: QueryDb,
  entityId: string,
): Promise<Crosswalks> {
  const [persons, parties, projects] = await Promise.all([
    db
      .select({
        sourceSystem: crosswalkPerson.sourceSystem,
        sourceUserId: crosswalkPerson.sourceUserId,
        resourceId: crosswalkPerson.resourceId,
      })
      .from(crosswalkPerson)
      .where(
        and(
          eq(crosswalkPerson.entityId, entityId),
          isNull(crosswalkPerson.deletedAt),
        ),
      ),
    db
      .select({
        matchType: crosswalkParty.matchType,
        matchValue: crosswalkParty.matchValue,
        clientId: crosswalkParty.clientId,
      })
      .from(crosswalkParty)
      .where(
        and(
          eq(crosswalkParty.entityId, entityId),
          isNull(crosswalkParty.deletedAt),
        ),
      ),
    db
      .select({
        projectId: crosswalkProject.projectId,
        clientId: crosswalkProject.clientId,
        mondayBoardId: crosswalkProject.mondayBoardId,
        sharepointFolder: crosswalkProject.sharepointFolder,
        hubspotDealId: crosswalkProject.hubspotDealId,
      })
      .from(crosswalkProject)
      .where(
        and(
          eq(crosswalkProject.entityId, entityId),
          isNull(crosswalkProject.deletedAt),
        ),
      ),
  ]);

  return { persons, parties, projects };
}
