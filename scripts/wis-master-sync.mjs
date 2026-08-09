// One-off initial master-data population for WIS capture (reviewed 2026-08-09).
// DRY RUN by default: reads prod, prints the plan, writes NOTHING.
// Run:  node scripts/wis-master-sync.mjs         (dry run)
//       node scripts/wis-master-sync.mjs --apply (execute)  <-- only after review
//
// Encodes the operator-reviewed mapping. External ids come from the live
// Monday/HubSpot connectors (see the sync proposal). Matching is by natural key
// (client name, project code, resource name) so it is idempotent and re-runnable.
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");
const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const log = (...a) => console.log(...a);

// --- reviewed mapping (external ids from the connectors) --------------------
const CLIENTS = [
  { name: "Masen", create: true, domains: ["kochcc.com"], nameVariants: ["Masen"] },
  { name: "Slate Auto", create: true, domains: ["slate.auto"], nameVariants: ["Slate"] },
  { name: "Craft Crate", create: true, domains: ["craftcratellc.com"], nameVariants: ["Craft Crate"] },
  { matchName: "LeMans Corporation", domains: ["parts-unltd.com"], nameVariants: ["LeMans", "Parts Unlimited"] },
  { matchName: "J.W. Speaker", domains: ["jwspeaker.com"], nameVariants: ["JW Speaker"] },
  { matchName: "__MICROLUMIX__", domains: ["microlumix.com"], nameVariants: ["MicroLumix"] },
];

// projects: reuse existing by code where given, else create. board+deal = crosswalk.
const PROJECTS = [
  { code: "P-6055", client: "LeMans Corporation", board: "18412772819", deal: "322911437529", reuse: true },
  { code: "P-6201", name: "Masen — CAD Drafting Support", client: "Masen", board: "18413735998", deal: "324817444554", type: "fixed_fee" },
  { code: "P-6202", name: "Masen — Product Build Sprint", client: "Masen", board: "18414372092", deal: "322912102113", type: "fixed_fee" },
  { code: "P-6203", name: "Masen — Solutions Engineering Sprint", client: "Masen", board: "18412922456", deal: "323519294147", type: "fixed_fee" },
  { code: "P-6210", name: "Slate — Accessories Sourcing Support", client: "Slate Auto", board: "18413873129", deal: "222285054657", type: "time_materials" },
  { code: "P-6220", name: "Craft Crate — Engineering Triage", client: "Craft Crate", board: "18413685288", deal: "272709372606", type: "time_materials" },
  // Rolling MicroLumix retainer: reuse P-7001, point at current month's deal + workflow board.
  { code: "P-7001", rename: "MicroLumix — Fractional ID Retainer (rolling)", client: "__MICROLUMIX__", board: "18416874184", deal: "340506406625", reuse: true },
];

const RETIRE_PROJECTS = [
  { code: "P-6060", why: "Lighting Strategy seed; J.W. Speaker is BD, not a project" },
  { code: "P-6041", why: "GermPass seed; folded into rolling MicroLumix retainer (P-7001)" },
];

// people: survivor chosen by (has auth id) then (real title). crosswalk ids from connectors.
const PEOPLE = [
  { name: "Justin Gasal", mergeTitles: ["Sr. Engineer", "Engineer 2"], monday: "17945105" },
  { name: "Ryan Hahn", mergeTitles: ["Design Director", "Sr. Industrial Design"], monday: "25604021" },
  { name: "Marc McAllister", create: true, monday: "49043078", hubspot: "161550831" },
  { name: "Wesley Hopkins", create: true, monday: "104790697" },
];
// Flagged, NOT auto-merged: Michael/Mike Hopkins (two auth ids). monday 17848957 hubspot 80335435.
const RETIRE_RESOURCES = [
  { name: "Casey Designer", why: "seed sample" },
  { name: "Jordan Principal", why: "seed sample" },
];

// Resolved survivor/dupe ids (verified in the dry run). Apply aborts if any is missing.
const MERGE_RESOURCES = [
  { keep: "73898c87-9d0e-4ef1-914b-f81def9fec89", drop: "568750fa-bf3d-4f2b-9e3f-094036f6625f", retitle: "Sr. Engineer" }, // Justin
  { keep: "e1dbef77-adec-4851-a092-ae9d8244a8c6", drop: "abd8011b-da12-46f3-bad3-fc4e34c1c664", retitle: "Design Director" }, // Ryan
  { keep: "55c2f2e8-c4fa-494b-b4d8-9ee6fc5e7759", drop: "fdaff9ed-f301-438f-83af-fe3a95fb9081" }, // Michael (login = Michael Hopkins)
];
const MERGE_CLIENT = { keep: "bd8f6613-967c-4279-9ffb-9d5fde2a38ee", drop: "d56f7c47-67ca-4964-bf2b-341f47463827" }; // MicroLumix
const CROSSWALK_PERSON = [
  { resource: "73898c87-9d0e-4ef1-914b-f81def9fec89", ids: [["monday", "17945105"]] }, // Justin
  { resource: "e1dbef77-adec-4851-a092-ae9d8244a8c6", ids: [["monday", "25604021"]] }, // Ryan
  { resource: "55c2f2e8-c4fa-494b-b4d8-9ee6fc5e7759", ids: [["monday", "17848957"], ["hubspot", "80335435"]] }, // Michael
];
// Tables with a plain resource_id (no resource-scoped unique) — safe to bulk re-point.
const RESOURCE_REF_TABLES_PLAIN = ["time_entry", "expense", "rate_override"];
const CLIENT_REF_TABLES = ["contact", "project", "invoice", "crosswalk_party", "crosswalk_project"];

async function executeApply(tx, scope, actor) {
  const audit = async (table, recordId, action, after) =>
    tx`insert into audit_log (organization_id, entity_id, table_name, record_id, action, actor_id, after)
       values (${scope.organization_id}, ${scope.entity_id}, ${table}, ${recordId}, ${action}, ${actor}, ${after})`;

  // 1. clients to create (by name)
  const clientId = {};
  for (const c of CLIENTS.filter((x) => x.create)) {
    const [row] = await tx`insert into client (organization_id, entity_id, name, created_by, updated_by)
      select ${scope.organization_id}, ${scope.entity_id}, ${c.name}, ${actor}, ${actor}
      where not exists (select 1 from client where name=${c.name} and deleted_at is null)
      returning id`;
    const [found] = row ? [row] : await tx`select id from client where name=${c.name} and deleted_at is null limit 1`;
    clientId[c.name] = found.id;
    if (row) await audit("client", found.id, "insert", { name: c.name });
  }
  // resolve existing client ids
  for (const n of ["LeMans Corporation", "J.W. Speaker"]) {
    const [r] = await tx`select id from client where name=${n} and deleted_at is null limit 1`;
    clientId[n] = r.id;
  }
  clientId["__MICROLUMIX__"] = MERGE_CLIENT.keep;

  // 2. merge MicroLumix dupe -> survivor
  for (const t of CLIENT_REF_TABLES)
    await tx`update ${tx(t)} set client_id=${MERGE_CLIENT.keep} where client_id=${MERGE_CLIENT.drop}`;
  await tx`update client set deleted_at=now(), updated_by=${actor} where id=${MERGE_CLIENT.drop} and deleted_at is null`;
  await audit("client", MERGE_CLIENT.drop, "delete", { mergedInto: MERGE_CLIENT.keep });

  // 3. crosswalk_party (idempotent)
  for (const c of CLIENTS) {
    const cid = c.create ? clientId[c.name] : clientId[c.matchName === "__MICROLUMIX__" ? "__MICROLUMIX__" : c.matchName];
    for (const d of c.domains || [])
      await tx`insert into crosswalk_party (organization_id, entity_id, match_type, match_value, client_id, created_by, updated_by)
        values (${scope.organization_id}, ${scope.entity_id}, 'email_domain', ${d}, ${cid}, ${actor}, ${actor})
        on conflict (entity_id, match_type, match_value) do update set client_id=${cid}`;
    for (const v of c.nameVariants || [])
      await tx`insert into crosswalk_party (organization_id, entity_id, match_type, match_value, client_id, created_by, updated_by)
        values (${scope.organization_id}, ${scope.entity_id}, 'name_variant', ${v.toLowerCase()}, ${cid}, ${actor}, ${actor})
        on conflict (entity_id, match_type, match_value) do update set client_id=${cid}`;
  }

  // 4. projects: create new / rename reuse, then crosswalk_project
  const projectId = {};
  for (const p of PROJECTS) {
    const [ex] = await tx`select id, client_id from project where code=${p.code} and deleted_at is null limit 1`;
    const cid = clientId[p.client];
    if (ex) {
      projectId[p.code] = ex.id;
      if (p.rename) await tx`update project set name=${p.rename}, client_id=${cid}, updated_by=${actor} where id=${ex.id}`;
    } else {
      const [row] = await tx`insert into project (organization_id, entity_id, client_id, code, name, type, created_by, updated_by)
        values (${scope.organization_id}, ${scope.entity_id}, ${cid}, ${p.code}, ${p.name}, ${p.type}, ${actor}, ${actor}) returning id`;
      projectId[p.code] = row.id;
      await audit("project", row.id, "insert", { code: p.code, name: p.name });
    }
    await tx`insert into crosswalk_project (organization_id, entity_id, project_id, client_id, monday_board_id, hubspot_deal_id, created_by, updated_by)
      values (${scope.organization_id}, ${scope.entity_id}, ${projectId[p.code]}, ${cid}, ${p.board}, ${p.deal}, ${actor}, ${actor})
      on conflict (entity_id, project_id) do update set client_id=${cid}, monday_board_id=${p.board}, hubspot_deal_id=${p.deal}`;
  }

  // 5. retire seed projects
  for (const r of RETIRE_PROJECTS) {
    const res = await tx`update project set deleted_at=now(), status='closed', updated_by=${actor} where code=${r.code} and deleted_at is null returning id`;
    if (res.length) await audit("project", res[0].id, "delete", { reason: r.why });
  }

  // 6. merge resources
  for (const m of MERGE_RESOURCES) {
    // plain re-points (no resource-scoped unique constraint)
    for (const t of RESOURCE_REF_TABLES_PLAIN)
      await tx`update ${tx(t)} set resource_id=${m.keep} where resource_id=${m.drop}`;
    // signal: unique (provider, external_id, resource_id) — move non-colliding, soft-delete the rest
    await tx`update signal s set resource_id=${m.keep} where s.resource_id=${m.drop}
      and not exists (select 1 from signal k where k.resource_id=${m.keep} and k.provider=s.provider and k.external_id=s.external_id)`;
    await tx`update signal set deleted_at=now() where resource_id=${m.drop} and deleted_at is null`;
    // signal_rule: unique (resource_id, match_value) — same pattern
    await tx`update signal_rule sr set resource_id=${m.keep} where sr.resource_id=${m.drop}
      and not exists (select 1 from signal_rule k where k.resource_id=${m.keep} and k.match_value=sr.match_value)`;
    await tx`update signal_rule set deleted_at=now() where resource_id=${m.drop} and deleted_at is null`;
    // person_id on activity_event is not in a unique constraint
    await tx`update activity_event set person_id=${m.keep} where person_id=${m.drop}`;
    await tx`update crosswalk_person set resource_id=${m.keep} where resource_id=${m.drop}`;
    if (m.retitle) await tx`update resource set title=${m.retitle}, updated_by=${actor} where id=${m.keep}`;
    await tx`update resource set deleted_at=now(), updated_by=${actor} where id=${m.drop} and deleted_at is null`;
    await audit("resource", m.drop, "delete", { mergedInto: m.keep });
  }

  // 7. create new people
  const resById = {};
  for (const p of PEOPLE.filter((x) => x.create)) {
    const [ex] = await tx`select id from resource where name=${p.name} and deleted_at is null limit 1`;
    if (ex) resById[p.name] = ex.id;
    else {
      const [row] = await tx`insert into resource (organization_id, entity_id, name, created_by, updated_by)
        values (${scope.organization_id}, ${scope.entity_id}, ${p.name}, ${actor}, ${actor}) returning id`;
      resById[p.name] = row.id;
      await audit("resource", row.id, "insert", { name: p.name });
    }
  }

  // 8. crosswalk_person for merged survivors + new people
  const personXwalk = [
    ...CROSSWALK_PERSON,
    ...PEOPLE.filter((x) => x.create).map((p) => ({
      resource: resById[p.name],
      ids: [["monday", p.monday], ...(p.hubspot ? [["hubspot", p.hubspot]] : [])].filter(([, v]) => v),
    })),
  ];
  for (const px of personXwalk)
    for (const [sys, uid] of px.ids)
      await tx`insert into crosswalk_person (organization_id, entity_id, source_system, source_user_id, resource_id, created_by, updated_by)
        values (${scope.organization_id}, ${scope.entity_id}, ${sys}, ${uid}, ${px.resource}, ${actor}, ${actor})
        on conflict (entity_id, source_system, source_user_id) do update set resource_id=${px.resource}`;

  // 9. retire seed resources
  for (const r of RETIRE_RESOURCES) {
    const res = await tx`update resource set deleted_at=now(), status='inactive', updated_by=${actor} where name=${r.name} and deleted_at is null returning id`;
    if (res.length) await audit("resource", res[0].id, "delete", { reason: r.why });
  }
}

async function main() {
  log(`\n=== WIS master-data sync  [${APPLY ? "APPLY" : "DRY RUN"}] ===\n`);
  const clients = await sql`select id,name from client where deleted_at is null`;
  const projects = await sql`select id,code,name,client_id,status from project where deleted_at is null`;
  const resources = await sql`select id,name,title,user_id from resource where deleted_at is null`;
  const findClient = (n) => clients.filter((c) => c.name === n);

  // MicroLumix survivor (the row with the most time entries wins; ties -> first).
  const micro = clients.filter((c) => c.name.toLowerCase().startsWith("microlumix"));
  log("CLIENTS");
  for (const c of CLIENTS) {
    if (c.matchName === "__MICROLUMIX__") {
      log(`  MicroLumix: ${micro.length} row(s) found -> ${micro.length > 1 ? "MERGE into survivor + " : ""}link domains ${c.domains}`);
      for (const m of micro) log(`     - ${m.name} (${m.id})`);
    } else if (c.create) {
      const existing = findClient(c.name);
      log(`  ${existing.length ? "EXISTS" : "CREATE"} client "${c.name}"  domains=${c.domains}`);
    } else {
      const existing = findClient(c.matchName);
      log(`  ${existing.length ? "LINK" : "MISSING!"} "${c.matchName}"  +domains ${c.domains} +variants ${c.nameVariants}`);
    }
  }

  log("\nPROJECTS (crosswalk = monday board + hubspot deal)");
  for (const p of PROJECTS) {
    const existing = projects.find((x) => x.code === p.code);
    const verb = p.reuse ? (existing ? "REUSE" : "MISSING!") : existing ? "EXISTS" : "CREATE";
    log(`  ${verb} ${p.code} ${p.rename ? `-> rename "${p.rename}"` : p.name ? `"${p.name}"` : ""}`);
    log(`      board=${p.board} deal=${p.deal} client=${p.client}`);
  }

  log("\nRETIRE PROJECTS (soft delete)");
  for (const r of RETIRE_PROJECTS) {
    const ex = projects.find((x) => x.code === r.code);
    const teCount = ex ? (await sql`select count(*)::int n from time_entry where project_id=${ex.id}`)[0].n : 0;
    log(`  ${ex ? "RETIRE" : "absent"} ${r.code}  (${teCount} time entries kept)  — ${r.why}`);
  }

  log("\nPEOPLE");
  for (const p of PEOPLE) {
    const rows = resources.filter((r) => r.name === p.name);
    if (p.create) {
      log(`  ${rows.length ? "EXISTS" : "CREATE"} "${p.name}"  monday=${p.monday || "-"} hubspot=${p.hubspot || "-"}`);
    } else {
      const withAuth = rows.filter((r) => r.user_id);
      log(`  MERGE "${p.name}": ${rows.length} rows -> survivor ${withAuth[0]?.id ?? rows[0]?.id ?? "?"} (auth=${!!withAuth.length}); +crosswalk monday=${p.monday}`);
      for (const r of rows) {
        const te = (await sql`select count(*)::int n from time_entry where resource_id=${r.id}`)[0].n;
        log(`     - ${r.title} (${r.id}) auth=${r.user_id ? "yes" : "no"} timeEntries=${te}`);
      }
    }
  }
  const mikes = resources.filter((r) => /hopkins/i.test(r.name));
  log(`  FLAG (manual): Michael/Mike Hopkins — ${mikes.length} rows, pick surviving login:`);
  for (const r of mikes) log(`     - ${r.name} / ${r.title} (${r.id}) auth=${r.user_id ? "yes" : "no"}`);

  log("\nRETIRE RESOURCES (soft delete)");
  for (const r of RETIRE_RESOURCES) {
    const ex = resources.find((x) => x.name === r.name);
    const te = ex ? (await sql`select count(*)::int n from time_entry where resource_id=${ex.id}`)[0].n : 0;
    log(`  ${ex ? "RETIRE" : "absent"} "${r.name}" (${te} time entries kept) — ${r.why}`);
  }

  if (!APPLY) {
    log(`\n=== end DRY RUN (no changes written) ===`);
    return;
  }

  // --- APPLY -----------------------------------------------------------------
  // scope + actor
  const [scope] = await sql`select organization_id, entity_id from project limit 1`;
  const [mike] = await sql`select user_id from resource where id=${MERGE_RESOURCES[2].keep}`;
  const actor = mike?.user_id ?? null;

  // safety: every survivor/dupe id must exist before we mutate
  const ids = [...MERGE_RESOURCES.flatMap((m) => [m.keep, m.drop]), MERGE_CLIENT.keep, MERGE_CLIENT.drop];
  const present = (await sql`select id from resource where id = any(${ids}) union select id from client where id = any(${ids})`).map((r) => r.id);
  const missing = ids.filter((i) => !present.includes(i));
  if (missing.length) {
    log(`\nABORT: expected ids not found (data changed since dry run): ${missing.join(", ")}`);
    return;
  }

  log(`\nAPPLYING within a transaction (actor=${actor})...`);
  await sql.begin(async (tx) => {
    await executeApply(tx, scope, actor);
  });
  log("APPLIED.\n");

  // verification
  const v = {
    clients: (await sql`select count(*)::int n from client where deleted_at is null`)[0].n,
    projects: (await sql`select count(*)::int n from project where deleted_at is null`)[0].n,
    resources: (await sql`select count(*)::int n from resource where deleted_at is null`)[0].n,
    crosswalk_person: (await sql`select count(*)::int n from crosswalk_person`)[0].n,
    crosswalk_party: (await sql`select count(*)::int n from crosswalk_party`)[0].n,
    crosswalk_project: (await sql`select count(*)::int n from crosswalk_project`)[0].n,
  };
  log("Post-apply counts:", JSON.stringify(v));
  const dropped = MERGE_RESOURCES.map((m) => m.drop);
  const strandedMerge = (await sql`select count(*)::int n from time_entry where resource_id = any(${dropped})`)[0].n;
  log(`Time entries still on a MERGED-away resource: ${strandedMerge} (must be 0 — they should have re-pointed)`);
  log(`\n=== end APPLY ===`);
}

try {
  await main();
} finally {
  await sql.end();
}
