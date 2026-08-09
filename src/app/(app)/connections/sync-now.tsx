"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { syncNowAction, type SyncNowState } from "@/lib/actions/capture";

// "Sync now" with visible feedback: shows what the pull captured, which sources
// ran, and any per-source errors, so a no-op or a misconfigured source is
// obvious instead of silent.
export function SyncNow({ entityId }: { entityId: string }) {
  const [state, action, pending] = useActionState<SyncNowState, FormData>(
    syncNowAction,
    null,
  );

  return (
    <div className="flex flex-col gap-2">
      <form action={action}>
        <input type="hidden" name="entityId" value={entityId} />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Syncing…" : "Sync now"}
        </Button>
      </form>

      {state?.ok && (
        <div className="text-sm">
          <p className="text-muted-foreground">
            Captured <strong>{state.result.captured}</strong> ·{" "}
            {state.result.resolvedToProject} to projects ·{" "}
            {state.result.resolvedToClientOnly} to clients ·{" "}
            {state.result.unresolved} unresolved.
          </p>
          <p className="text-muted-foreground">
            {state.result.sourceLabels.length > 0
              ? `Sources run: ${state.result.sourceLabels.join(", ")}.`
              : "No sources configured (check MONDAY_API_TOKEN / HUBSPOT_SERVICE_KEY and that Outlook is connected)."}
          </p>
          {state.result.errors.length > 0 && (
            <p className="text-destructive">
              Errors: {state.result.errors.join(" · ")}
            </p>
          )}
        </div>
      )}
      {state && !state.ok && (
        <p className="text-destructive text-sm">Sync failed: {state.error}</p>
      )}
    </div>
  );
}
