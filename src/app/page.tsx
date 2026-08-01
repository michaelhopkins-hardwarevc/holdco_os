import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="rounded-full border px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Scaffold · Phase 0
      </span>

      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        HoldCo OS
      </h1>

      <p className="text-balance text-muted-foreground">
        Back-office operating system for a multi-entity holding company,
        professional-services firm, product company, and venture studio.
      </p>

      <p className="text-sm text-muted-foreground">
        The build pipeline is live. Features start with Phase 1 (Project
        Accounting Core).
      </p>

      <div className="flex items-center gap-3">
        <a href="/api/health" className={buttonVariants()}>
          Health check
        </a>
      </div>

      <p className="text-xs text-muted-foreground">
        GL of record: QuickBooks · This app is the operating layer, not the
        book of legal record.
      </p>
    </main>
  );
}
