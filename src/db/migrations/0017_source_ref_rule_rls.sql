-- Membership-scoped read policy for source_ref_rule (the per-source answers:
-- project / indirect / ignore), matching 0011's crosswalk pattern. Writes go
-- through service-role server actions (manager+).

grant select on public.source_ref_rule to authenticated;
--> statement-breakpoint

create policy "source_ref_rule_select_authenticated" on public.source_ref_rule
  for select to authenticated
  using (entity_id in (select public.app_current_entity_ids()));
