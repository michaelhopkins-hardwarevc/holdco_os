-- Membership-scoped read policy for activity_event, matching the pattern in
-- 0001/0003/0006/0011 (writes go through service-role server actions).

grant select on public.activity_event to authenticated;
--> statement-breakpoint

create policy "activity_event_select_authenticated" on public.activity_event
  for select to authenticated
  using (entity_id in (select public.app_current_entity_ids()));
