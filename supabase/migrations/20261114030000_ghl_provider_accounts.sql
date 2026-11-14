-- Each approved provider can connect their own GoHighLevel sub-account (location + token + optional pipeline).
-- The API seals the token with AES-256-GCM (GHL_CREDENTIALS_KEY, backend env only) before writing it, so this table
-- never holds a usable token. The sealed value is bound to provider_id + location_id and is not selectable from
-- the table; the backend reads it one provider at a time through ghl_provider_credentials().
create table public.ghl_provider_accounts (
  provider_id uuid primary key references public.profiles(id) on delete cascade,
  location_id text not null check (location_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  pipeline_id text check (pipeline_id is null or pipeline_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  pipeline_stage_id text check (pipeline_stage_id is null or pipeline_stage_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  token_ciphertext text not null check (length(token_ciphertext) <= 8192 and token_ciphertext ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (pipeline_stage_id is null or pipeline_id is not null)
);

alter table public.ghl_provider_accounts enable row level security;
revoke all on public.ghl_provider_accounts from public, anon, authenticated;
grant select (provider_id, location_id, pipeline_id, pipeline_stage_id, connected_at, updated_at) on public.ghl_provider_accounts to authenticated;
grant insert (provider_id, location_id, pipeline_id, pipeline_stage_id, token_ciphertext) on public.ghl_provider_accounts to authenticated;
grant update (provider_id, location_id, pipeline_id, pipeline_stage_id, token_ciphertext) on public.ghl_provider_accounts to authenticated;
grant delete on public.ghl_provider_accounts to authenticated;

create policy ghl_provider_accounts_read_own_or_operator on public.ghl_provider_accounts
  for select to authenticated using (
    provider_id = (select auth.uid())
    or exists (select 1 from public.request_administrators a where a.user_id = (select auth.uid()))
  );
create policy ghl_provider_accounts_insert_own_provider on public.ghl_provider_accounts
  for insert to authenticated with check (
    provider_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = provider_id and p.kind = 'provider')
  );
create policy ghl_provider_accounts_update_own_provider on public.ghl_provider_accounts
  for update to authenticated using (provider_id = (select auth.uid())) with check (
    provider_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = provider_id and p.kind = 'provider')
  );
-- Disconnecting stays possible after a provider loses the provider kind.
create policy ghl_provider_accounts_delete_own on public.ghl_provider_accounts
  for delete to authenticated using (provider_id = (select auth.uid()));

create schema if not exists ghl_private;
revoke all on schema ghl_private from public, anon, authenticated;
create function ghl_private.stamp_account() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.connected_at := case when tg_op = 'INSERT' or new.token_ciphertext is distinct from old.token_ciphertext
    or new.location_id is distinct from old.location_id then now() else old.connected_at end;
  return new;
end;
$$;
revoke all on function ghl_private.stamp_account() from public, anon, authenticated;
create trigger ghl_provider_accounts_stamp
  before insert or update on public.ghl_provider_accounts
  for each row execute function ghl_private.stamp_account();

-- Sealed credentials of one provider that still holds the provider kind, for any signed-in caller: customers need
-- a provider's calendars, and the value only opens inside the API. Who may act with it is decided by the API.
create function public.ghl_provider_credentials(provider uuid)
  returns table (location_id text, pipeline_id text, pipeline_stage_id text, token_ciphertext text)
  language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  return query
    select g.location_id, g.pipeline_id, g.pipeline_stage_id, g.token_ciphertext
    from public.ghl_provider_accounts g
    join public.profiles p on p.id = g.provider_id and p.kind = 'provider'
    where g.provider_id = provider;
end;
$$;
revoke all on function public.ghl_provider_credentials(uuid) from public, anon, authenticated;
grant execute on function public.ghl_provider_credentials(uuid) to authenticated;
