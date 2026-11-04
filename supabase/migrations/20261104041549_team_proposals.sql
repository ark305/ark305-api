create table public.team_proposals (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null,
  document text not null check (octet_length(document) <= 40000),
  signature text not null check (signature ~ '^[a-f0-9]{64}$')
);
create index team_proposals_owner_created on public.team_proposals(owner_id, created_at desc, id desc);
alter table public.team_proposals enable row level security;
revoke all on public.team_proposals from public, anon, authenticated;
grant select, insert on public.team_proposals to authenticated;
create policy team_proposals_read on public.team_proposals for select to authenticated
using ((select auth.uid()) = owner_id);
create policy team_proposals_insert on public.team_proposals for insert to authenticated
with check ((select auth.uid()) = owner_id);
