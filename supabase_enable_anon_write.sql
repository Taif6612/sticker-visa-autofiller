-- Enable anon INSERT / UPDATE / DELETE on public.clients so admin.html (and any
-- tool using the public anon key) can WRITE, not just read.
-- Run once: Supabase Dashboard -> SQL Editor -> New Query -> paste -> Run.
--
-- Fixes: HTTP 401  {"code":"42501", "message":"new row violates row-level
-- security policy for table \"clients\""} on insert/update/delete.
--
-- SECURITY: this makes the table writable by ANYONE holding the public anon key.
-- That is acceptable for the synthetic demo data in this project. If the table
-- ever holds real PII, DO NOT use this policy — keep anon read-only and perform
-- writes with the service_role key (or behind authenticated, row-scoped policies).

alter table public.clients enable row level security;

drop policy if exists "anon write clients (demo)" on public.clients;
create policy "anon write clients (demo)"
  on public.clients
  for all          -- INSERT, UPDATE, DELETE (SELECT already covered by the read policy)
  to anon
  using (true)
  with check (true);

-- Verify the policies now present on the table:
select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'clients';
