-- Live provider positions: one current row per provider, written only by that provider.
-- Freshness comes from the database clock; clients cannot choose recorded_at.
create table public.provider_locations (
  provider_id uuid primary key references public.profiles(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m double precision check (accuracy_m is null or accuracy_m between 0 and 10000),
  on_duty boolean not null default true,
  recorded_at timestamptz not null default now()
);
create index provider_locations_on_duty_recorded_idx
  on public.provider_locations(recorded_at desc) where on_duty;

alter table public.provider_locations enable row level security;
revoke all on public.provider_locations from public, anon, authenticated;
grant select on public.provider_locations to authenticated;
grant insert (provider_id, latitude, longitude, accuracy_m, on_duty) on public.provider_locations to authenticated;
grant update (provider_id, latitude, longitude, accuracy_m, on_duty) on public.provider_locations to authenticated;

create policy provider_locations_read_own_or_operator on public.provider_locations
  for select to authenticated using (
    provider_id = (select auth.uid())
    or exists (select 1 from public.request_administrators a where a.user_id = (select auth.uid()))
  );
create policy provider_locations_insert_own on public.provider_locations
  for insert to authenticated with check (
    provider_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = provider_id and p.kind = 'provider')
  );
create policy provider_locations_update_own on public.provider_locations
  for update to authenticated using (provider_id = (select auth.uid())) with check (
    provider_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = provider_id and p.kind = 'provider')
  );

create schema if not exists tracking_private;
revoke all on schema tracking_private from public, anon, authenticated;
create function tracking_private.stamp_location() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.recorded_at := now();
  return new;
end;
$$;
revoke all on function tracking_private.stamp_location() from public, anon, authenticated;
create trigger provider_locations_stamp
  before insert or update on public.provider_locations
  for each row execute function tracking_private.stamp_location();

-- Nearby search for any signed-in user. Only fresh (< 15 minutes), on-duty positions are considered.
-- Operators get exact distance and coordinates. Everyone else is matched against a ~1 km grid cell
-- and gets a distance rounded to 0.1 km without coordinates, so repeated probing cannot pinpoint a provider.
create function public.nearby_providers(origin_latitude double precision, origin_longitude double precision, radius_km double precision)
  returns table (provider_id uuid, distance_km double precision, age_seconds integer, latitude double precision, longitude double precision)
  language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  viewer uuid := auth.uid();
  operator boolean;
begin
  if viewer is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if origin_latitude is null or origin_longitude is null or radius_km is null
    or not (origin_latitude between -90 and 90) or not (origin_longitude between -180 and 180)
    or not (radius_km > 0 and radius_km <= 50) then
    raise exception 'Invalid nearby search' using errcode = '22023';
  end if;
  operator := exists (select 1 from public.request_administrators a where a.user_id = viewer);
  return query
    with fresh as (
      select l.provider_id, l.latitude, l.longitude,
        case when operator then l.latitude else round(l.latitude::numeric, 2)::double precision end as match_latitude,
        case when operator then l.longitude else round(l.longitude::numeric, 2)::double precision end as match_longitude,
        greatest(0, floor(extract(epoch from (now() - l.recorded_at))))::integer as age
      from public.provider_locations l
      where l.on_duty
        and l.recorded_at > now() - interval '15 minutes'
        and l.latitude between origin_latitude - radius_km / 110.0 - 0.01 and origin_latitude + radius_km / 110.0 + 0.01
    ), measured as (
      select f.*, 2 * 6371.0088 * asin(least(1, sqrt(
        power(sin(radians(f.match_latitude - origin_latitude) / 2), 2)
        + cos(radians(origin_latitude)) * cos(radians(f.match_latitude)) * power(sin(radians(f.match_longitude - origin_longitude) / 2), 2)
      ))) as distance
      from fresh f
    )
    select m.provider_id,
      case when operator then m.distance else round(m.distance::numeric, 1)::double precision end,
      m.age,
      case when operator then m.latitude end,
      case when operator then m.longitude end
    from measured m
    where m.distance <= radius_km
    order by m.distance, m.provider_id
    limit 50;
end;
$$;
revoke all on function public.nearby_providers(double precision, double precision, double precision) from public, anon, authenticated;
grant execute on function public.nearby_providers(double precision, double precision, double precision) to authenticated;
