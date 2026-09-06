import { PageHeader, Panel } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { runWithUser } from "@/db/rls";
import {
  addPartyCrosswalk,
  addPersonCrosswalk,
  deleteCrosswalk,
  deleteSourceRefRuleAction,
  upsertProjectCrosswalk,
} from "@/lib/actions/crosswalks";
import { MANAGER_ROLES, requireActiveEntity } from "@/lib/auth";
import { describeSourceRef } from "@/lib/source-ref";
import {
  listClients,
  listCrosswalkParties,
  listCrosswalkPersons,
  listCrosswalkProjects,
  listProjects,
  listResources,
  listSourceRefRules,
} from "@/lib/queries";

// Crosswalks: how the outside world's ids map onto this app's people, clients
// and projects. HubSpot masters customers, Monday masters projects; these rows
// only reference their ids. Most rows arrive by themselves (Outlook connect,
// queue mappings, confirm-time corrections); this screen is for review and
// the occasional manual entry.
export default async function CrosswalksPage() {
  const { ctx, active } = await requireActiveEntity();
  if (!MANAGER_ROLES.includes(active.role)) {
    return (
      <PageHeader
        eyebrow="crosswalks"
        title="Crosswalks"
        blurb="Only managers, admins, and owners can edit crosswalks."
      />
    );
  }

  const data = await runWithUser(ctx.authUser.id, async (tx) => ({
    persons: await listCrosswalkPersons(tx, active.entityId),
    parties: await listCrosswalkParties(tx, active.entityId),
    projectsX: await listCrosswalkProjects(tx, active.entityId),
    resources: await listResources(tx, active.entityId, { activeOnly: true }),
    clients: await listClients(tx, active.entityId),
    projects: await listProjects(tx, active.entityId),
    rules: await listSourceRefRules(tx, active.entityId),
  }));

  const del = (kind: "person" | "party" | "project", id: string) => (
    <form action={deleteCrosswalk}>
      <input type="hidden" name="entityId" value={active.entityId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="xs">
        Remove
      </Button>
    </form>
  );

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="crosswalks"
        title="Crosswalks"
        blurb={`${active.entityName} · which external ids belong to which person, client, and project. Rows are added for you when someone connects Outlook, maps a source in the queue, or corrects a drafted block. Edit here only when a mapping is wrong.`}
      />

      {/* Source rules: the explicit per-source answers from the queue and from
          confirm-time corrections (project, indirect, or ignore). */}
      <Panel title="Source rules" right="from the queue and your corrections">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Answer</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-alum-2">
                  No rules yet. Map a source in the Queue, or correct a drafted
                  block on the timesheet, and it appears here.
                </TableCell>
              </TableRow>
            ) : (
              data.rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{describeSourceRef(r.sourceRef)}</TableCell>
                  <TableCell className="font-mono text-[11px] uppercase">
                    {r.kind === "project" ? (
                      <span className="text-acid">{r.projectCode ?? "project"}</span>
                    ) : r.kind === "indirect" ? (
                      <span className="text-alum">{r.indirectCode ?? "indirect"}</span>
                    ) : (
                      <span className="text-alum-2">ignored</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <form action={deleteSourceRefRuleAction}>
                      <input type="hidden" name="entityId" value={active.entityId} />
                      <input type="hidden" name="id" value={r.id} />
                      <Button type="submit" variant="ghost" size="xs">
                        Forget
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Panel>

      {/* Projects */}
      <Panel title="Projects" right="Monday board · HubSpot deal · SharePoint · Xero tracking">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Monday board</TableHead>
              <TableHead>HubSpot deal</TableHead>
              <TableHead>SharePoint folder</TableHead>
              <TableHead>Xero tracking</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.projectsX.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-alum-2">
                  No project mappings yet.
                </TableCell>
              </TableRow>
            ) : (
              data.projectsX.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <span className="text-acid font-mono">{r.projectCode}</span>{" "}
                    <span className="text-alum">{r.projectName}</span>
                  </TableCell>
                  <TableCell className="text-alum-2">{r.clientName}</TableCell>
                  <TableCell className="font-mono text-[12px]">{r.mondayBoardId ?? "—"}</TableCell>
                  <TableCell className="font-mono text-[12px]">{r.hubspotDealId ?? "—"}</TableCell>
                  <TableCell className="font-mono text-[12px]">{r.sharepointFolder ?? "—"}</TableCell>
                  <TableCell className="font-mono text-[12px]">{r.xeroTrackingOption ?? "—"}</TableCell>
                  <TableCell className="text-right">{del("project", r.id)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {data.projects.length > 0 && (
          <form
            action={upsertProjectCrosswalk}
            className="border-line grid gap-3 border-t px-4 py-4 sm:grid-cols-6"
          >
            <input type="hidden" name="entityId" value={active.entityId} />
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label>Project</Label>
              <Select name="projectId" defaultValue={data.projects[0].id}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {data.projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.code} · {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Monday board id</Label>
              <Input name="mondayBoardId" placeholder="18412772819" />
            </div>
            <div className="flex flex-col gap-1">
              <Label>HubSpot deal id</Label>
              <Input name="hubspotDealId" placeholder="322911437529" />
            </div>
            <div className="flex flex-col gap-1">
              <Label>SharePoint folder</Label>
              <Input name="sharepointFolder" placeholder="/Clients/Acme/P-6055" />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Xero tracking option</Label>
              <Input name="xeroTrackingOption" placeholder="P-6055" />
            </div>
            <div className="sm:col-span-6">
              <Button type="submit" size="sm">
                Save project mapping ›
              </Button>
            </div>
          </form>
        )}
      </Panel>

      {/* Clients */}
      <Panel title="Clients" right="email domain or name variant">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Match</TableHead>
              <TableHead>Value</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.parties.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-alum-2">
                  No client mappings yet.
                </TableCell>
              </TableRow>
            ) : (
              data.parties.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.clientName}</TableCell>
                  <TableCell className="text-alum-2 font-mono text-[11px] uppercase">
                    {r.matchType.replace("_", " ")}
                  </TableCell>
                  <TableCell className="font-mono text-[12px]">{r.matchValue}</TableCell>
                  <TableCell className="text-right">{del("party", r.id)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {data.clients.length > 0 && (
          <form
            action={addPartyCrosswalk}
            className="border-line grid gap-3 border-t px-4 py-4 sm:grid-cols-4"
          >
            <input type="hidden" name="entityId" value={active.entityId} />
            <div className="flex flex-col gap-1">
              <Label>Client</Label>
              <Select name="clientId" defaultValue={data.clients[0].id}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {data.clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Match</Label>
              <Select name="matchType" defaultValue="email_domain">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email_domain">Email domain</SelectItem>
                  <SelectItem value="name_variant">Name variant</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Value</Label>
              <Input name="matchValue" placeholder="acme.com" required />
            </div>
            <div className="flex items-end">
              <Button type="submit" size="sm">
                Add ›
              </Button>
            </div>
          </form>
        )}
      </Panel>

      {/* People */}
      <Panel title="People" right="external user id → person">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>System</TableHead>
              <TableHead>External user id</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.persons.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-alum-2">
                  No people mappings yet. Connecting Outlook adds one automatically.
                </TableCell>
              </TableRow>
            ) : (
              data.persons.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.resourceName}</TableCell>
                  <TableCell className="text-alum-2 font-mono text-[11px] uppercase">
                    {r.sourceSystem}
                  </TableCell>
                  <TableCell className="font-mono text-[12px]">{r.sourceUserId}</TableCell>
                  <TableCell className="text-right">{del("person", r.id)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {data.resources.length > 0 && (
          <form
            action={addPersonCrosswalk}
            className="border-line grid gap-3 border-t px-4 py-4 sm:grid-cols-4"
          >
            <input type="hidden" name="entityId" value={active.entityId} />
            <div className="flex flex-col gap-1">
              <Label>Person</Label>
              <Select name="resourceId" defaultValue={data.resources[0].id}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {data.resources.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>System</Label>
              <Select name="sourceSystem" defaultValue="monday">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monday">Monday</SelectItem>
                  <SelectItem value="hubspot">HubSpot</SelectItem>
                  <SelectItem value="microsoft">Microsoft (Entra id)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>External user id</Label>
              <Input name="sourceUserId" placeholder="17945105" required />
            </div>
            <div className="flex items-end">
              <Button type="submit" size="sm">
                Add ›
              </Button>
            </div>
          </form>
        )}
      </Panel>
    </div>
  );
}
