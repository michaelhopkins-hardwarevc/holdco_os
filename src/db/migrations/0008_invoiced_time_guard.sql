-- Protect invoiced time from re-billing at the DB level (CLAUDE.md). Once a
-- time_entry is invoiced, its billing fields can't change. Un-invoicing (a void,
-- which sets status back to 'approved') is still allowed.

create or replace function public.guard_invoiced_time_entry()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'invoiced' and new.status = 'invoiced' then
    if new.hours is distinct from old.hours
       or new.bill_rate is distinct from old.bill_rate
       or new.billable is distinct from old.billable
       or new.billable_amount is distinct from old.billable_amount
       or new.project_id is distinct from old.project_id
       or new.phase_id is distinct from old.phase_id
       or new.indirect_code_id is distinct from old.indirect_code_id then
      raise exception 'Invoiced time cannot be edited or re-billed (entry %).', old.id;
    end if;
  end if;
  return new;
end;
$$;
--> statement-breakpoint

create trigger guard_invoiced_time_entry
  before update on public.time_entry
  for each row
  execute function public.guard_invoiced_time_entry();
