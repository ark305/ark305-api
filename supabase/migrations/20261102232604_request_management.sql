-- Request management is not booking confirmation or payment processing.
-- Provision the sole administrator separately using an explicitly verified user UUID.
create table public.request_administrators (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete cascade
);
alter table public.request_administrators enable row level security;
revoke all on public.request_administrators from public, anon, authenticated;
grant select on public.request_administrators to authenticated;
create policy request_administrators_read_self on public.request_administrators
  for select to authenticated using (user_id = (select auth.uid()));

alter table public.service_requests drop constraint service_requests_status_check;
alter table public.service_requests add constraint service_requests_status_check
  check (status in ('received', 'in_progress', 'closed', 'cancelled'));

create table public.service_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  from_status text not null check (from_status in ('received', 'in_progress')),
  to_status text not null check (to_status in ('in_progress', 'closed', 'cancelled')),
  actor_id uuid not null,
  created_at timestamptz not null default clock_timestamp()
);
create index service_request_events_request_created_idx
  on public.service_request_events(request_id, created_at, id);
alter table public.service_request_events enable row level security;
revoke all on public.service_request_events from public, anon, authenticated;
grant select on public.service_request_events to authenticated;
create policy service_request_events_read_visible on public.service_request_events
  for select to authenticated using (
    exists (select 1 from public.service_requests r where r.id = request_id)
  );

create policy service_requests_read_admin on public.service_requests
  for select to authenticated using (
    exists (select 1 from public.request_administrators where user_id = (select auth.uid()))
  );
create policy service_requests_update_admin on public.service_requests
  for update to authenticated using (
    exists (select 1 from public.request_administrators where user_id = (select auth.uid()))
  ) with check (
    exists (select 1 from public.request_administrators where user_id = (select auth.uid()))
  );
grant update (status) on public.service_requests to authenticated;

create schema if not exists request_management_private;
revoke all on schema request_management_private from public, anon, authenticated;
create function request_management_private.record_transition() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.request_administrators where user_id = auth.uid()) then
    raise exception 'Request administration required' using errcode = '42501';
  end if;
  if not ((old.status = 'received' and new.status in ('in_progress', 'cancelled'))
    or (old.status = 'in_progress' and new.status in ('closed', 'cancelled'))) then
    raise exception 'Invalid request transition' using errcode = '23514';
  end if;
  insert into public.service_request_events (request_id, from_status, to_status, actor_id)
    values (old.id, old.status, new.status, auth.uid());
  return new;
end;
$$;
revoke all on function request_management_private.record_transition() from public, anon, authenticated;
create trigger service_requests_record_transition
  after update of status on public.service_requests
  for each row execute function request_management_private.record_transition();
