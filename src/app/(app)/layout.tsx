import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette } from "@/components/command-palette";
import { SidebarEntitySwitcher } from "@/components/sidebar-entity-switcher";
import { resolveActiveEntity } from "@/lib/active-entity";
import { requireContext } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireContext();
  const active = await resolveActiveEntity(ctx.memberships);

  return (
    <div className="flex min-h-screen">
      {ctx.memberships.length > 0 && (
        <AppSidebar
          userName={ctx.appUser.name ?? ctx.appUser.email}
          role={active?.role ?? "member"}
          switcher={
            <SidebarEntitySwitcher
              memberships={ctx.memberships}
              activeEntityId={active?.entityId ?? null}
            />
          }
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader entityName={active?.entityName ?? "HoldCo OS"} />
        <main className="mx-auto w-full max-w-[1400px] px-8 py-7 pb-18">
          {children}
        </main>
      </div>
      <CommandPalette memberships={ctx.memberships} />
    </div>
  );
}
