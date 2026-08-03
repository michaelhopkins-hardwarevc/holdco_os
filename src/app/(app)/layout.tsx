import Link from "next/link";
import { EntitySwitcher } from "@/components/entity-switcher";
import { Button } from "@/components/ui/button";
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
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
        <div className="flex items-center gap-5">
          <Link href="/dashboard" className="font-semibold">
            HoldCo OS
          </Link>
          <nav className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <Link href="/dashboard" className="hover:text-foreground">
              Dashboard
            </Link>
            {active && (
              <>
                <Link href="/timesheet" className="hover:text-foreground">
                  Timesheet
                </Link>
                <Link href="/approvals" className="hover:text-foreground">
                  Approvals
                </Link>
                <Link href="/expenses" className="hover:text-foreground">
                  Expenses
                </Link>
                <Link href="/invoices" className="hover:text-foreground">
                  Invoices
                </Link>
                <Link href="/clients" className="hover:text-foreground">
                  Clients
                </Link>
                <Link href="/projects" className="hover:text-foreground">
                  Projects
                </Link>
                <Link href="/resources" className="hover:text-foreground">
                  Resources
                </Link>
                <Link href="/indirect-codes" className="hover:text-foreground">
                  Indirect codes
                </Link>
                <Link href="/connections" className="hover:text-foreground">
                  Connections
                </Link>
              </>
            )}
            <Link href="/entities" className="hover:text-foreground">
              Entities
            </Link>
            {active && (
              <Link
                href={`/entities/${active.entityId}/members`}
                className="hover:text-foreground"
              >
                Members
              </Link>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {ctx.memberships.length > 0 && (
            <EntitySwitcher
              memberships={ctx.memberships}
              activeEntityId={active?.entityId ?? null}
            />
          )}
          <Link
            href="/account"
            className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline"
          >
            {ctx.appUser.email}
          </Link>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
