-- ARK305 · Fase 2: perfiles reales, servicios y fotos.
-- Pégalo completo en Supabase → SQL Editor → Run. Se puede correr más de una vez.

create extension if not exists citext;

-- ---------- Perfiles ----------
-- Un perfil por cuenta. El handle es el enlace público: ark305.com/@handle
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  handle      citext unique not null check (handle ~ '^[a-z0-9._]{3,30}$'),
  name        text not null check (char_length(name) between 1 and 60),
  kind        text not null default 'member' check (kind in ('member', 'provider', 'creator', 'remote', 'brand')),
  role        text not null default '' check (char_length(role) <= 60),
  area        text not null default '' check (char_length(area) <= 60),
  tagline     text not null default '' check (char_length(tagline) <= 80),
  photo_url   text check (photo_url is null or char_length(photo_url) <= 500),
  banner_url  text check (banner_url is null or char_length(banner_url) <= 500),
  gallery     text[] not null default '{}' check (cardinality(gallery) <= 12),
  instagram   text check (instagram is null or char_length(instagram) <= 200),
  tiktok      text check (tiktok is null or char_length(tiktok) <= 200),
  facebook    text check (facebook is null or char_length(facebook) <= 200),
  bio_link    boolean not null default false, -- "Pon tu ARK en tu bio"
  shared      boolean not null default false, -- "Comparte tu perfil"
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- Servicios del perfil (la vitrina) ----------
create table if not exists public.services (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references public.profiles (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 80),
  kicker      text not null default '' check (char_length(kicker) <= 30),
  detail      text not null default '' check (char_length(detail) <= 80),
  price       integer not null check (price between 0 and 1000000),
  action      text not null default 'book' check (action in ('book', 'request', 'view')),
  photo_url   text check (photo_url is null or char_length(photo_url) <= 500),
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists services_owner_idx on public.services (owner, position);

-- updated_at automático
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------- Reglas de privacidad ----------
-- Todos pueden ver perfiles y servicios. Solo el dueño los crea, edita o borra.
alter table public.profiles enable row level security;
alter table public.services enable row level security;

drop policy if exists profiles_read on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_read   on public.profiles for select using (true);
create policy profiles_insert on public.profiles for insert with check (id = auth.uid());
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists services_read on public.services;
drop policy if exists services_insert on public.services;
drop policy if exists services_update on public.services;
drop policy if exists services_delete on public.services;
create policy services_read   on public.services for select using (true);
create policy services_insert on public.services for insert with check (owner = auth.uid());
create policy services_update on public.services for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy services_delete on public.services for delete using (owner = auth.uid());

-- ---------- Fotos ----------
-- Carpeta pública "media". Cada persona solo sube a su propia carpeta: media/<su-id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists media_insert on storage.objects;
drop policy if exists media_update on storage.objects;
drop policy if exists media_delete on storage.objects;
create policy media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy media_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
