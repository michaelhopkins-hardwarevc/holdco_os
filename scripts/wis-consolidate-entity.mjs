// One-off: move the real master data out of the seed entity ("Brooks Stevens
// Design Associates", members owner@/manager@/staff@example.com) into the live
// entity ("Brooks Stevens", the one with the real logins, connections and
// captured activity). The 9 Aug master sync wrote clients/projects/crosswalks
// into the seed entity by mistake, so nothing captured for the live entity
// could ever resolve to a project.
//
// DRY RUN by default: prints the plan, writes NOTHING.
//   node scripts/wis-consolidate-entity.mjs          (dry run)
//   node scripts/wis-consolidate-entity.mjs --apply  (execute, one transaction)
//
// Moves (re-points entity_id): client, project, phase, crosswalk_party,
// crosswalk_project, crosswalk_person, resource (deduped by name), rate_override.
// Leaves in the seed entity (then soft-deletes the entity): seed users'
// memberships, seed time entries, seed invoice, seed activity events.
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");
const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const log = (...a) => console.log(...a);

const LIVE_NAME = "Brooks Stevens";
const SEED_NAME = "Brooks Stevens Design Associates";

async function main() {
  log(`\n=== consolidate entities  [${APPLY ? "APPLY" : "DRY RUN"}] ===\n`);
  const [live] = await sql`select id, organization_id from entity where name=${LIVE_NAME} and deleted_at is null`;
  const [seed] = await sql`select id, organization_id from entity where name=${SEED_NAME} and deleted_at is null`;
  if (!live || !seed) throw new Error("expected both entities to exist");
  if (live.organization_id !== seed.organization_id) throw new Error("entities are in different organizations");
  log(`live entity: ${live.id}\nseed entity: ${seed.id}\n`);

  const count = async (table, ent) =>
    (await sql`select count(*)::int n from ${sql(table)} where entity_id=${ent} and deleted_at is null`)[0].n;
  for (const t of ["client", "project", "phase", "resource", "crosswalk_party", "crosswalk_project", "crosswalk_person", "rate_override", "time_entry", "invoice", "activity_event", "signal", "source_connection", "membership"]) {
    log(`  ${t.padEnd(18)} seed=${await count(t, seed.id)}  live=${await count(t, live.id)}`);
  }

  // Name collisions between the two entities (same client/project/resource name).
  const dupClients = await sql`select s.name from client s join client l on lower(l.name)=lower(s.name) and l.entity_id=${live.id} and l.deleted_at is null where s.entity_id=${seed.id} and s.deleted_at is null`;
  const dupProjects = await sql`select s.code from project s join project l on lower(l.code)=lower(s.code) and l.entity_id=${live.id} and l.deleted_at is null where s.entity_id=${seed.id} and s.deleted_at is null`;
  const dupResources = await sql`select s.id seed_id, l.id live_id, s.name, s.user_id seed_user, l.user_id live_user,
      (select email from "user" u where u.id=s.user_id) seed_email, (select email from "user" u where u.id=l.user_id) live_email
    from resource s join resource l on lower(l.name)=lower(s.name) and l.entity_id=${live.id} and l.deleted_at is null
    where s.entity_id=${seed.id} and s.deleted_at is null`;
  log(`\nname collisions: clients=${dupClients.map((c) => c.name).join(",") || "none"}  projects=${dupProjects.map((p) => p.code).join(",") || "none"}`);
  for (const r of dupResources) log(`  resource "${r.name}": seed ${r.seed_id} (login ${r.seed_email ?? "none"}) vs live ${r.live_id} (login ${r.live_email ?? "none"})`);

  // Seed users whose login is attached to a moving resource: never carry a
  // fake @example.com login into the live entity.
  const seedLogins = await sql`select r.id, r.name, u.email from resource r join "user" u on u.id=r.user_id where r.entity_id=${seed.id} and r.deleted_at is null`;
  for (const r of seedLogins) log(`  moving resource "${r.name}" carries login ${r.email}${r.email.endsWith("@example.com") ? "  -> will be DETACHED (seed login)" : ""}`);

  log(`\nplan:
  1. re-point entity_id seed->live on: client, project, phase, crosswalk_party, crosswalk_project, crosswalk_person, rate_override
     (client/project name collisions: the LIVE row is kept; the seed row is merged into it and soft-deleted)
  2. resources: move seed rows; where a name exists in both, keep the row WITH a real login, merge the other into it
  3. detach any @example.com login from a moved resource
  4. soft-delete the seed entity (its memberships, seed time/invoices/events stay attached to it, out of sight)
  5. audit_log rows for every merge/move`);

  if (!APPLY) {
    log(`\n=== end DRY RUN (no changes written) ===`);
    return;
  }

  const [actorRow] = await sql`select u.id from "user" u join membership m on m.user_id=u.id where m.entity_id=${live.id} and m.role in ('owner','admin') and u.email not like '%@example.com' order by m.role limit 1`;
  const actor = actorRow?.id ?? null;

  await sql.begin(async (tx) => {
    const audit = (table, recordId, action, after) =>
      tx`insert into audit_log (organization_id, entity_id, table_name, record_id, action, actor_id, after)
         values (${live.organization_id}, ${live.id}, ${table}, ${recordId}, ${action}, ${actor}, ${after})`;

    // --- clients: merge collisions into the live row, move the rest.
    for (const c of dupClients) {
      const [s] = await tx`select id from client where entity_id=${seed.id} and lower(name)=lower(${c.name}) and deleted_at is null`;
      const [l] = await tx`select id from client where entity_id=${live.id} and lower(name)=lower(${c.name}) and deleted_at is null`;
      for (const t of ["contact", "project", "invoice", "crosswalk_party", "crosswalk_project"])
        await tx`update ${tx(t)} set client_id=${l.id} where client_id=${s.id}`;
      await tx`update client set deleted_at=now(), updated_by=${actor} where id=${s.id}`;
      await audit("client", s.id, "merge", { into: l.id, name: c.name });
    }
    await tx`update client set entity_id=${live.id}, updated_by=${actor} where entity_id=${seed.id} and deleted_at is null`;

    // --- projects: merge code collisions, move the rest (phases follow).
    for (const p of dupProjects) {
      const [s] = await tx`select id from project where entity_id=${seed.id} and lower(code)=lower(${p.code}) and deleted_at is null`;
      const [l] = await tx`select id from project where entity_id=${live.id} and lower(code)=lower(${p.code}) and deleted_at is null`;
      for (const t of ["phase", "time_entry", "expense", "invoice", "signal", "signal_rule", "rate_override", "activity_event"]) {
        const col = t === "activity_event" ? "resolved_project_id" : "project_id";
        await tx`update ${tx(t)} set ${tx(col)}=${l.id} where ${tx(col)}=${s.id}`;
      }
      // crosswalk_project is unique per (entity, project): merge columns into the live row.
      const [sx] = await tx`select * from crosswalk_project where project_id=${s.id} and deleted_at is null`;
      if (sx) {
        await tx`insert into crosswalk_project (organization_id, entity_id, project_id, client_id, monday_board_id, hubspot_deal_id, sharepoint_folder, xero_tracking_option, created_by, updated_by)
          values (${live.organization_id}, ${live.id}, ${l.id}, ${sx.client_id}, ${sx.monday_board_id}, ${sx.hubspot_deal_id}, ${sx.sharepoint_folder}, ${sx.xero_tracking_option}, ${actor}, ${actor})
          on conflict (entity_id, project_id) do update set
            monday_board_id=coalesce(crosswalk_project.monday_board_id, excluded.monday_board_id),
            hubspot_deal_id=coalesce(crosswalk_project.hubspot_deal_id, excluded.hubspot_deal_id),
            sharepoint_folder=coalesce(crosswalk_project.sharepoint_folder, excluded.sharepoint_folder),
            xero_tracking_option=coalesce(crosswalk_project.xero_tracking_option, excluded.xero_tracking_option)`;
        await tx`update crosswalk_project set deleted_at=now() where id=${sx.id}`;
      }
      await tx`update project set deleted_at=now(), updated_by=${actor} where id=${s.id}`;
      await audit("project", s.id, "merge", { into: l.id, code: p.code });
    }
    await tx`update project set entity_id=${live.id}, updated_by=${actor} where entity_id=${seed.id} and deleted_at is null`;
    await tx`update phase set entity_id=${live.id}, updated_by=${actor} where entity_id=${seed.id} and deleted_at is null`;

    // --- crosswalks (party/project/person) and rate overrides follow.
    for (const t of ["crosswalk_party", "crosswalk_project", "crosswalk_person", "rate_override"])
      await tx`update ${tx(t)} set entity_id=${live.id} where entity_id=${seed.id} and deleted_at is null`;

    // --- resources: dedupe by name, prefer a real (non-seed) login.
    for (const r of dupResources) {
      const seedReal = r.seed_email && !r.seed_email.endsWith("@example.com");
      const liveReal = r.live_email && !r.live_email.endsWith("@example.com");
      const keep = liveReal || !seedReal ? r.live_id : r.seed_id;
      const drop = keep === r.live_id ? r.seed_id : r.live_id;
      for (const t of ["time_entry", "expense", "rate_override", "activity_event"]) {
        const col = t === "activity_event" ? "person_id" : "resource_id";
        await tx`update ${tx(t)} set ${tx(col)}=${keep} where ${tx(col)}=${drop}`;
      }
      await tx`update signal s set resource_id=${keep} where s.resource_id=${drop}
        and not exists (select 1 from signal k where k.resource_id=${keep} and k.provider=s.provider and k.external_id=s.external_id)`;
      await tx`update signal set deleted_at=now() where resource_id=${drop} and deleted_at is null`;
      await tx`update signal_rule sr set resource_id=${keep} where sr.resource_id=${drop}
        and not exists (select 1 from signal_rule k where k.resource_id=${keep} and k.match_value=sr.match_value)`;
      await tx`update signal_rule set deleted_at=now() where resource_id=${drop} and deleted_at is null`;
      await tx`update crosswalk_person cp set resource_id=${keep} where cp.resource_id=${drop}
        and not exists (select 1 from crosswalk_person k where k.entity_id=cp.entity_id and k.source_system=cp.source_system and k.source_user_id=cp.source_user_id and k.resource_id=${keep})`;
      await tx`update crosswalk_person set deleted_at=now() where resource_id=${drop} and deleted_at is null`;
      await tx`update resource set deleted_at=now(), updated_by=${actor} where id=${drop}`;
      await tx`update resource set entity_id=${live.id} where id=${keep}`;
      await audit("resource", drop, "merge", { into: keep, name: r.name });
    }
    await tx`update resource set entity_id=${live.id}, updated_by=${actor} where entity_id=${seed.id} and deleted_at is null`;
    // detach fake logins
    await tx`update resource r set user_id=null from "user" u where u.id=r.user_id and u.email like '%@example.com' and r.entity_id=${live.id}`;

    // --- retire the seed entity
    await tx`update entity set deleted_at=now() where id=${seed.id}`;
    await audit("entity", seed.id, "retire", { reason: "seed entity; masters moved to live entity" });
  });

  log("APPLIED.\n");
  for (const t of ["client", "project", "phase", "resource", "crosswalk_party", "crosswalk_project", "crosswalk_person"]) {
    log(`  ${t.padEnd(18)} live=${await count(t, live.id)}`);
  }
  log(`\n=== end APPLY ===`);
}

try {
  await main();
} finally {
  await sql.end();
}
