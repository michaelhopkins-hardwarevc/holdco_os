"use client";

import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

// Sticky top header: breadcrumb (ENTITY / SCREEN) + ⌘K search. The search button
// opens the command palette (which also binds ⌘K globally).
export function AppHeader({ entityName }: { entityName: string }) {
  const pathname = usePathname();
  const seg = pathname.split("/").filter(Boolean)[0] ?? "dashboard";
  const screen = seg.replace(/-/g, " ");

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-line bg-[rgba(12,14,16,0.86)] px-6 backdrop-blur">
      <div className="truncate font-mono text-[10.5px] tracking-[0.1em] text-alum-2 uppercase">
        {entityName} <span className="mx-2 text-line">/</span> {screen}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("cmdk:open"))}
          className="flex h-[30px] items-center gap-3 rounded-md border border-line bg-graphite px-2.5 font-mono text-[11px] text-alum-2 transition-colors hover:border-alum-2 hover:text-alum"
        >
          <span>SEARCH ANYTHING</span>
          <span className="rounded border border-line px-1 text-[10px]">⌘K</span>
        </button>
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
