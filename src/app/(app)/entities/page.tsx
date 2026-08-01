import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { entityType } from "@/db/schema";
import { createEntity } from "@/lib/actions/entities";
import { requireContext } from "@/lib/auth";

export default async function EntitiesPage() {
  const ctx = await requireContext();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Entities</h1>
        <p className="text-muted-foreground">
          The legal companies you belong to. You only see entities you&apos;re a
          member of.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {ctx.memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">No entities yet.</p>
        ) : (
          ctx.memberships.map((m) => (
            <Link
              key={m.entityId}
              href={`/entities/${m.entityId}`}
              className="flex items-center justify-between rounded-lg border px-4 py-3 hover:bg-muted"
            >
              <span className="font-medium">{m.entityName}</span>
              <span className="text-sm text-muted-foreground">{m.role}</span>
            </Link>
          ))
        )}
      </div>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Create an entity</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createEntity} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required placeholder="Vault, STS…" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="legalName">Legal name (optional)</Label>
              <Input id="legalName" name="legalName" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Type</Label>
              <Select name="type" defaultValue="services">
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {entityType.enumValues.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-fit">
              Create entity
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
