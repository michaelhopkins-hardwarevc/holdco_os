-- source_connection holds OAuth tokens. Even encrypted, they must never be
-- readable through the API. Remove the authenticated read policy/grant added in
-- 0003 so only the service-role connection (server actions) can read this table.

drop policy if exists "source_connection_select_authenticated" on public.source_connection;
--> statement-breakpoint
revoke select on public.source_connection from authenticated;
