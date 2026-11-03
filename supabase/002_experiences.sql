-- ARK305 · Personal / Business, Diagnóstico ARK, feed que aprende y límite de la IA.
-- Pégalo en Supabase → SQL Editor → Run (después de schema.sql). Se puede correr más de una vez.

-- Personal o Business (se guarda como 'lifestyle' = Personal o 'business' = Business).
alter table public.profiles add column if not exists experience text
  check (experience is null or experience in ('lifestyle', 'business', 'both'));

-- Gustos que aprende el feed (tema → puntos).
alter table public.profiles add column if not exists taste jsonb not null default '{}'::jsonb;

-- Diagnóstico ARK: respuestas y resultado (ARK Snapshot). La persona lo ve, edita y borra
-- en "Lo que ARK sabe de mí". Nunca guarda estatus migratorio, salud, religión, orientación ni política.
alter table public.profiles add column if not exists diagnosis jsonb;

-- Límite diario de ARK IA por persona (para controlar el costo).
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users on delete cascade,
  day     date not null default current_date,
  n       int  not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;

-- Suma un uso de hoy a quien está conectado y dice si todavía está dentro del límite.
create or replace function public.bump_ai(lim int) returns boolean
language plpgsql security definer set search_path = public as $$
declare cur int;
begin
  if auth.uid() is null then return false; end if;
  insert into public.ai_usage (user_id, day, n) values (auth.uid(), current_date, 1)
  on conflict (user_id, day) do update set n = public.ai_usage.n + 1
  returning n into cur;
  return cur <= lim;
end $$;
revoke all on function public.bump_ai(int) from public, anon;
grant execute on function public.bump_ai(int) to authenticated;
