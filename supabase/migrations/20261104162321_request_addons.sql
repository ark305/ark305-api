-- Accepted complements remain attached to the original request, not a booking.
create table public.service_request_addons (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  service_id text not null,
  qty integer not null default 1 check (qty = 1),
  accepted_at timestamptz not null default clock_timestamp(),
  unique (request_id, service_id)
);
alter table public.service_request_addons enable row level security;
revoke all on public.service_request_addons from public, anon, authenticated;
grant select on public.service_request_addons to authenticated;
grant insert (request_id, service_id) on public.service_request_addons to authenticated;
create policy request_addons_read_visible on public.service_request_addons
  for select to authenticated using (
    exists (select 1 from public.service_requests r where r.id = request_id)
  );
create policy request_addons_accept_owner on public.service_request_addons
  for insert to authenticated with check (
    exists (select 1 from public.service_requests r where r.id = request_id and r.requester_id = (select auth.uid()))
  );

create function request_management_private.validate_addon() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare parent public.service_requests%rowtype;
begin
  -- Serialize acceptance against administrative status updates on the same row.
  select * into parent from public.service_requests where id = new.request_id for update;
  if not found or parent.requester_id is distinct from auth.uid() then
    raise exception 'Request owner required' using errcode = '42501';
  end if;
  if parent.status not in ('received', 'in_progress') then
    raise exception 'Request is no longer active' using errcode = '23514';
  end if;
  if not (
    (parent.service_id in ('yacht', 'catamaran') and new.service_id in ('chef', 'bottles', 'photographer')) or
    (parent.service_id in ('jetski', 'heli') and new.service_id in ('suv', 'photographer')) or
    (parent.service_id in ('restaurant', 'vipTable') and new.service_id = 'suv') or
    (parent.service_id = 'villa' and new.service_id in ('chef', 'brunch'))
  ) then
    raise exception 'Invalid complement' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function request_management_private.validate_addon() from public, anon, authenticated;
create trigger service_request_addons_validate before insert on public.service_request_addons
  for each row execute function request_management_private.validate_addon();
