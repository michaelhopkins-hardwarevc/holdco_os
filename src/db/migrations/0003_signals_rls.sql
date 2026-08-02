-- Membership-scoped read policies for the Signals tables, matching the pattern
-- in 0001 (writes go through service-role server actions).

grant select on public.signal to authenticated;
--> statement-breakpoint
grant select on public.source_connection to authenticated;
--> statement-breakpoint

create policy "signal_select_authenticated" on public.signal
  for select to authenticated
  using (entity_id in (select public.app_current_entity_ids()));
--> statement-breakpoint

create policy "source_connection_select_authenticated" on public.source_connection
  for select to authenticated
  using (entity_id in (select public.app_current_entity_ids()));
