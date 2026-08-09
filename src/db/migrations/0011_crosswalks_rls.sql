-- Membership-scoped read policies for the crosswalk tables, matching the pattern
-- in 0001/0003/0006 (writes go through service-role server actions).

grant select on public.crosswalk_person to authenticated;
--> statement-breakpoint
grant select on public.crosswalk_party to authenticated;
--> statement-breakpoint
grant select on public.crosswalk_project to authenticated;
--> statement-breakpoint

create policy "crosswalk_person_select_authenticated" on public.crosswalk_person
  for select to authenticated
  using (entity_id in (select public.app_current_entity_ids()));
--> statement-breakpoint

create policy "crosswalk_party_select_authenticated" on public.crosswalk_party
  for select to authenticated
  using (entity_id in (select public.app_current_entity_ids()));
--> statement-breakpoint

create policy "crosswalk_project_select_authenticated" on public.crosswalk_project
  for select to authenticated
  using (entity_id in (select public.app_current_entity_ids()));
