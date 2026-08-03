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

// Full-width sidebar entity switcher. Same selectEntity server action as before;
// styled as the Marmik "// ENTITY / name ⇅" block.
export function SidebarEntitySwitcher({
  memberships,
  activeEntityId,
}: {
  memberships: MembershipInfo[];
  activeEntityId: string | null;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="border-b border-line px-[18px] py-3.5">
      <div className="mb-1 font-mono text-[10px] tracking-[0.1em] text-alum-2 uppercase">
        {"// entity"}
      </div>
      <Select
        value={activeEntityId ?? undefined}
        onValueChange={(value) =>
          startTransition(() => selectEntity(String(value)))
        }
        disabled={pending || memberships.length === 0}
      >
        <SelectTrigger
          aria-label="Active entity"
          className="h-auto w-full border-0 bg-transparent px-0 py-0 font-display text-[13.5px] font-semibold text-bone hover:border-0 focus-visible:ring-0"
        >
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
    </div>
  );
}
