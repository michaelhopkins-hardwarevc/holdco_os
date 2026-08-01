"use client";

import { useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { selectEntity } from "@/lib/actions/active-entity";
import type { MembershipInfo } from "@/lib/auth";

export function EntitySwitcher({
  memberships,
  activeEntityId,
}: {
  memberships: MembershipInfo[];
  activeEntityId: string | null;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={activeEntityId ?? undefined}
      onValueChange={(value) =>
        startTransition(() => selectEntity(String(value)))
      }
      disabled={pending || memberships.length === 0}
    >
      <SelectTrigger className="w-[240px]" aria-label="Active entity">
        <SelectValue placeholder="Select entity" />
      </SelectTrigger>
      <SelectContent>
        {memberships.map((m) => (
          <SelectItem key={m.entityId} value={m.entityId}>
            {m.entityName} · {m.role}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
