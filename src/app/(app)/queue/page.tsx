import Link from "next/link";
import { PageHeader, Panel } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { runWithUser } from "@/db/rls";
import { mapRefToProjectAction } from "@/lib/actions/crosswalks";
import { MANAGER_ROLES, requireActiveEntity } from "@/lib/auth";
import { describeSourceRef } from "@/lib/source-ref";
import { getWeek } from "@/lib/timesheet";
import {
  listProjects,
  listUnresolvedRefs,
  listUnresolvedSignals,
} from "@/lib/queries";

// The "tap once, never asks twice" queue (WIS design). Two lists: sources the
// crosswalks could not place (map one to a project and every event carrying it
// re-resolves), and drafted blocks still waiting for a charge on a timesheet.
export default async function QueuePage() {
  const { ctx, active } = await requireActiveEntity();
  if (!MANAGER_ROLES.includes(active.role)) {
    return (
      <PageHeader
        eyebrow="queue"
        title="Unresolved work"
        blurb="Only managers, admins, and owners can map sources to projects."
      />
    );
  }

  const { refs, blocks, projects } = await runWithUser(
    ctx.authUser.id,
    async (tx) => ({
      refs: await listUnresolvedRefs(tx, active.entityId),
      blocks: await listUnresolvedSignals(tx, active.entityId),
      projects: await listProjects(tx, active.entityId),
    }),
  );

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="queue"
        title={
          refs.length === 0
            ? "Nothing waiting to be placed"
            : `${refs.length} source${refs.length === 1 ? "" : "s"} waiting to be placed`
        }
        blurb={`${active.entityName} · a board, a deal, or an email domain the crosswalks could not place. Map it to a project once and every event that carries it re-files itself, now and in future syncs.`}
      />

      <Panel title="Unmapped sources" right="tap once, remembered">
        {refs.length === 0 ? (
          <div className="text-alum-2 px-4 py-4 text-[13px]">
            Every captured source resolves to a project or client.
          </div>
        ) : (
          <div className="flex flex-col">
            {refs.map((r) => (
              <div
                key={r.sourceRef ?? ""}
                className="border-line flex flex-wrap items-center gap-3 border-b border-dashed px-4 py-3 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-bone text-[13.5px]">
                    {describeSourceRef(r.sourceRef ?? "")}
                  </div>
                  <div className="text-alum-2 font-mono text-[10.5px]">
                    {r.n} event{r.n === 1 ? "" : "s"}
                    {r.lastSeen
                      ? ` · last ${r.lastSeen.toISOString().slice(0, 10)}`
                      : ""}
                    {r.sampleSubject ? ` · "${r.sampleSubject.slice(0, 60)}"` : ""}
                  </div>
                </div>
                {projects.length > 0 && (
                  <form action={mapRefToProjectAction} className="flex items-center gap-2">
                    <input type="hidden" name="entityId" value={active.entityId} />
                    <input type="hidden" name="ref" value={r.sourceRef ?? ""} />
                    <Select name="projectId" defaultValue={projects[0].id}>
                      <SelectTrigger className="h-8 w-[240px]">
                        <SelectValue placeholder="Project" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.code} · {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="submit" size="sm">
                      Map ›
                    </Button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Blocks waiting for a charge" right={`${blocks.length}`}>
        {blocks.length === 0 ? (
          <div className="text-alum-2 px-4 py-4 text-[13px]">
            No drafted time is waiting for a project.
          </div>
        ) : (
          <div className="flex flex-col">
            {blocks.map((b) => (
              <div
                key={b.id}
                className="border-line flex flex-wrap items-center gap-3 border-b border-dashed px-4 py-3 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-bone text-[13.5px]">
                    {b.resourceName} · {b.workDate}
                  </div>
                  <div className="text-alum-2 font-mono text-[10.5px]">
                    {b.provenance ? `${b.provenance} · ` : ""}
                    {b.evidence}
                  </div>
                </div>
                <Link
                  href={`/timesheet?week=${getWeek(b.workDate).start}&resource=${b.resourceId}`}
                  className="text-alum hover:text-acid font-mono text-[11px] uppercase"
                >
                  open week ›
                </Link>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
