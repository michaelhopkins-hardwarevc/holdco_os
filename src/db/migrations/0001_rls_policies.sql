-- Row-level security policies (spec §7.1, CLAUDE.md).
--
-- Reads are scoped by membership: a user only sees rows for entities they
-- belong to. Writes are performed by authorized server actions via the
-- service-role connection (which bypasses RLS) after an explicit role check,
-- so no INSERT/UPDATE policies are granted to `authenticated` here.
--
-- Two SECURITY DEFINER helpers resolve the current user and their entity set
-- while bypassing RLS, which keeps the policies simple and non-recursive.

-- auth.uid() -> our public.user.id
create or replace function public.app_current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from public."user"
  where auth_id = auth.uid() and deleted_at is null
$$;
--> statement-breakpoint

-- The set of entity ids the current user is a member of.
create or replace function public.app_current_entity_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select entity_id from public.membership
  where user_id = public.app_current_user_id() and deleted_at is null
$$;
--> statement-breakpoint

-- Authenticated users can read (subject to the policies below); all writes go
-- through the service-role connection.
grant usage on schema public to authenticated;
--> statement-breakpoint
grant select on all tables in schema public to authenticated;
--> statement-breakpoint

-- Identity tables -----------------------------------------------------------

create policy "organization_select_authenticated" on public.organization
  for select to authenticated
  using (
    id in (
      select e.organization_id from public.entity e
      where e.id in (select public.app_current_entity_ids())
    )
  );
--> statement-breakpoint

create policy "entity_select_authenticated" on public.entity
  for select to authenticated
  using (id in (select public.app_current_entity_ids()));
--> statement-breakpoint

create policy "membership_select_authenticated" on public.membership
  for select to authenticated
  using (entity_id in (select public.app_current_entity_ids()));
--> statement-breakpoint

create policy "user_select_authenticated" on public."user"
  for select to authenticated
  using (
    id = public.app_current_user_id()
    or id in (
      select m.user_id from public.membership m
      where m.entity_id in (select public.app_current_entity_ids())
    )
  );
--> statement-breakpoint

-- Entity-scoped Phase 1 tables ----------------------------------------------

create policy "client_select_authenticated" on public.client
  for select to authenticated
  using (entity_id in (select public.app_current_entity_ids()));
--> statement-breakpoint

create policy "contact_select_authenticated" on public.contact
  for select to authenticated
  using (entity_id in (select public.app_current_entity_ids()));
--> statement-breakpoint

create policy "project_select_authenticated" on public.project
  for select to authenticated
  using (entity_id in (select public.app_current_entity_ids()));
--> statement-breakpoint

create policy "phase_select_authenticated" on public.phase
  for select to authenticated
  using (entity_id in (select public.app_current_entity_ids()));
--> statement-breakpoint

create policy "resource_select_authenticated" on public.resource
  for select to authenticated
  using (entity_id in (select public.app_current_entity_ids()));
--> statement-breakpoint

create policy "rate_override_select_authenticated" on public.rate_override
  for select to authenticated
  using (entity_id in (select public.app_current_entity_ids()));
--> statement-breakpoint

create policy "indirect_code_select_authenticated" on public.indirect_code
  for select to authenticated
  using (entity_id in (select public.app_current_entity_ids()));
--> statement-breakpoint

create policy "time_entry_select_authenticated" on public.time_entry
  for select to authenticated
  using (entity_id in (select public.app_current_entity_ids()));
--> statement-breakpoint

create policy "expense_select_authenticated" on public.expense
  for select to authenticated
  using (entity_id in (select public.app_current_entity_ids()));
--> statement-breakpoint

create policy "invoice_select_authenticated" on public.invoice
  for select to authenticated
  using (entity_id in (select public.app_current_entity_ids()));
--> statement-breakpoint

create policy "invoice_line_select_authenticated" on public.invoice_line
  for select to authenticated
  using (entity_id in (select public.app_current_entity_ids()));
--> statement-breakpoint

create policy "payment_select_authenticated" on public.payment
  for select to authenticated
  using (entity_id in (select public.app_current_entity_ids()));
