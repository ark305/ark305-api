-- Service requests record customer interest; they are not bookings or provider commitments.
create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  service_id text not null check (char_length(service_id) between 1 and 64),
  requested_date date not null,
  guests integer not null check (guests between 1 and 20),
  preferences text not null default '' check (char_length(preferences) <= 2000),
  status text not null default 'received' check (status = 'received'),
  created_at timestamptz not null default now()
);

create index if not exists service_requests_owner_created_idx
  on public.service_requests (requester_id, created_at desc, id desc);

alter table public.service_requests enable row level security;

drop policy if exists service_requests_read_own on public.service_requests;
drop policy if exists service_requests_insert_own on public.service_requests;

create policy service_requests_read_own
  on public.service_requests for select to authenticated
  using ((select auth.uid()) = requester_id);

create policy service_requests_insert_own
  on public.service_requests for insert to authenticated
  with check ((select auth.uid()) = requester_id);

-- Table defaults in exposed schemas can be broad; revoke them before granting this API's surface.
revoke all on table public.service_requests from public, anon, authenticated;
grant select (id, requester_id, service_id, requested_date, guests, preferences, status, created_at)
  on table public.service_requests to authenticated;
grant insert (service_id, requested_date, guests, preferences)
  on table public.service_requests to authenticated;
