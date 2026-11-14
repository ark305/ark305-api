-- Services each approved provider publishes (public.services in schema.sql is the profiles module's service cards). Only the owner writes their rows (owner = auth.uid(), never client-chosen);
-- everyone signed in reads active services of current providers. Services are deactivated, never deleted, so
-- requests and orders that reference them keep resolving.
create table public.provider_services (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120 and name = btrim(name)),
  description text not null default '' check (char_length(description) <= 2000),
  price_cents integer not null check (price_cents between 0 and 100000000),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  duration_minutes integer not null check (duration_minutes between 1 and 43200),
  category text not null check (category in ('transport', 'water', 'dining', 'nightlife', 'home', 'content', 'other')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index provider_services_provider_idx on public.provider_services (provider_id, updated_at desc);
create index provider_services_active_category_idx on public.provider_services (category, updated_at desc) where active;

alter table public.provider_services enable row level security;
revoke all on public.provider_services from public, anon, authenticated;
grant select on public.provider_services to authenticated;
grant insert (provider_id, name, description, price_cents, currency, duration_minutes, category, active) on public.provider_services to authenticated;
grant update (name, description, price_cents, currency, duration_minutes, category, active) on public.provider_services to authenticated;

create policy provider_services_read_active_or_own on public.provider_services
  for select to authenticated using (
    provider_id = (select auth.uid())
    or (active and exists (select 1 from public.profiles p where p.id = provider_id and p.kind = 'provider'))
  );
create policy provider_services_insert_own_provider on public.provider_services
  for insert to authenticated with check (
    provider_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = provider_id and p.kind = 'provider')
  );
-- A provider who lost the provider kind can still deactivate their services, but cannot reactivate them.
create policy provider_services_update_own on public.provider_services
  for update to authenticated using (provider_id = (select auth.uid())) with check (
    provider_id = (select auth.uid())
    and (not active or exists (select 1 from public.profiles p where p.id = provider_id and p.kind = 'provider'))
  );

create schema if not exists services_private;
revoke all on schema services_private from public, anon, authenticated;
create function services_private.stamp_service() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
    new.provider_id := old.provider_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function services_private.stamp_service() from public, anon, authenticated;
create trigger provider_services_stamp
  before insert or update on public.provider_services
  for each row execute function services_private.stamp_service();

-- Public search: active services of current providers, filtered by category, provider and/or text
-- (case-insensitive substring of name or description; LIKE wildcards in the text are matched literally).
-- Runs as the caller, so the RLS above still applies.
create function public.search_provider_services(
  search_text text default null, search_category text default null, search_provider uuid default null,
  result_limit integer default 50, result_offset integer default 0)
  returns setof public.provider_services
  language sql stable security invoker set search_path = '' as $$
  select s.*
  from public.provider_services s
  where s.active
    and exists (select 1 from public.profiles p where p.id = s.provider_id and p.kind = 'provider')
    and (search_category is null or s.category = search_category)
    and (search_provider is null or s.provider_id = search_provider)
    and (search_text is null or search_text = ''
      or s.name ilike '%' || replace(replace(replace(search_text, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      or s.description ilike '%' || replace(replace(replace(search_text, '\', '\\'), '%', '\%'), '_', '\_') || '%')
  order by s.updated_at desc, s.id
  limit least(greatest(coalesce(result_limit, 50), 1), 100)
  offset least(greatest(coalesce(result_offset, 0), 0), 10000);
$$;
revoke all on function public.search_provider_services(text, text, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.search_provider_services(text, text, uuid, integer, integer) to authenticated;
