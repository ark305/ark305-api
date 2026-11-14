-- Becoming a provider requires operator approval. Members file an application; an operator
-- (request_administrators) approves or rejects it. Direct writes of kind = 'provider' by
-- anon/authenticated callers are rejected; only the security-definer decision RPC can set it.
-- Existing provider profiles are left untouched.

create table public.provider_applications (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  check ((status = 'pending') = (decided_at is null))
);
create index provider_applications_pending_idx on public.provider_applications (requested_at) where status = 'pending';
alter table public.provider_applications enable row level security;
revoke all on public.provider_applications from public, anon, authenticated;
grant select on public.provider_applications to authenticated;
create policy provider_applications_read on public.provider_applications
  for select to authenticated using (
    user_id = (select auth.uid())
    or exists (select 1 from public.request_administrators where user_id = (select auth.uid()))
  );

create schema if not exists provider_approval_private;
revoke all on schema provider_approval_private from public, anon, authenticated;

-- Not security definer on purpose: current_user must stay the caller's role.
create function provider_approval_private.guard_provider_kind() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if new.kind = 'provider' and (tg_op = 'INSERT' or old.kind is distinct from 'provider')
    and current_user in ('anon', 'authenticated') then
    raise exception 'Operator approval required to become a provider' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function provider_approval_private.guard_provider_kind() from public, anon, authenticated;
create trigger profiles_provider_kind_guard before insert or update of kind on public.profiles
  for each row execute function provider_approval_private.guard_provider_kind();

create function public.request_provider_role() returns setof public.provider_applications
  language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  current_kind text;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  -- Lock the profile first (same order as decide_provider_application) so a concurrent approval is seen.
  select kind into current_kind from public.profiles where id = caller for update;
  if not found then
    raise exception 'Profile required' using errcode = '23503';
  end if;
  if current_kind = 'provider' then
    raise exception 'Already a provider' using errcode = '23505';
  end if;
  return query
    with filed as (
      insert into public.provider_applications as a (user_id) values (caller)
      on conflict (user_id) do update
        set status = 'pending', requested_at = now(), decided_at = null, decided_by = null
        where a.status <> 'pending'
      returning a.*
    )
    select * from filed;
  if not found then
    return query select * from public.provider_applications where user_id = caller;
  end if;
end;
$$;
revoke all on function public.request_provider_role() from public, anon, authenticated;
grant execute on function public.request_provider_role() to authenticated;

create function public.decide_provider_application(applicant uuid, approve boolean)
  returns setof public.provider_applications
  language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null or not exists (select 1 from public.request_administrators where user_id = caller) then
    raise exception 'Operator required' using errcode = '42501';
  end if;
  if applicant is null or approve is null then
    raise exception 'Invalid decision' using errcode = '22023';
  end if;
  perform 1 from public.profiles where id = applicant for update;
  return query
    with decided as (
      update public.provider_applications a
        set status = case when approve then 'approved' else 'rejected' end, decided_at = now(), decided_by = caller
        where a.user_id = applicant and a.status = 'pending'
      returning a.*
    )
    select * from decided;
  if found and approve then
    update public.profiles set kind = 'provider' where id = applicant;
  end if;
end;
$$;
revoke all on function public.decide_provider_application(uuid, boolean) from public, anon, authenticated;
grant execute on function public.decide_provider_application(uuid, boolean) to authenticated;
