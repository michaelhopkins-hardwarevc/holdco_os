-- Membership-scoped read policy for learned signal rules (writes go through
-- service-role server actions), matching the pattern in 0001/0003.

grant select on public.signal_rule to authenticated;
--> statement-breakpoint

create policy "signal_rule_select_authenticated" on public.signal_rule
  for select to authenticated
  using (entity_id in (select public.app_current_entity_ids()));
