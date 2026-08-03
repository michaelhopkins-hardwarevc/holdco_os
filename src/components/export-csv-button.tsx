import { buttonVariants } from "@/components/ui/button";

// Links to the CSV export route for a given list type (spec §7.7). Server
// component: just a styled anchor to /api/export.
export function ExportCsvButton({
  type,
  entityId,
  label = "Export CSV",
}: {
  type: string;
  entityId: string;
  label?: string;
}) {
  return (
    <a
      href={`/api/export?type=${type}&entityId=${entityId}`}
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      {label}
    </a>
  );
}
