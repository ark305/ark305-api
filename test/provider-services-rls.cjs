// Optional probe: applies the provider services migration to an isolated postgres:17 container (no network, never pulls images).
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const name = `ark305-provider-services-${randomBytes(12).toString('hex')}`;
const migration = fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/20261114040000_provider_services.sql'), 'utf8');
const [provider, member, customer, second] = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
const docker = (args, input) => spawnSync('docker', args, { encoding: 'utf8', input, timeout: 30000 });
const run = (script, ok = true) => {
  const result = docker(['exec', '-i', name, 'psql', '-U', 'postgres', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], script);
  if (ok) assert.equal(result.status, 0, result.stderr); else assert.equal(result.status, 3, `expected a SQL error: ${result.stdout}`);
  return ok ? result.stdout.trim() : result.stderr;
};
const as = (id, role = 'authenticated') => `set role ${role}; set request.jwt.claims = '${JSON.stringify(id ? { sub: id, role } : { role })}';`;
const insert = (owner, values = `'Yate', 150000, 240, 'water'`) =>
  `insert into public.provider_services (provider_id, name, price_cents, duration_minutes, category) values ('${owner}', ${values}) returning id;`;
const search = (args = '') => `select coalesce(string_agg(name, ',' order by name), '') from public.search_provider_services(${args});`;
const pass = label => process.stdout.write(`PASS ${label}\n`);

async function main() {
  assert.equal(docker(['image', 'inspect', 'postgres:17']).status, 0, 'postgres:17 must already be available locally');
  assert.equal(docker(['run', '--pull=never', '--network=none', '--rm', '-d', '--name', name, '-e', `POSTGRES_PASSWORD=${randomBytes(24).toString('hex')}`, 'postgres:17']).status, 0);
  try {
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      ready = docker(['exec', name, 'pg_isready', '-U', 'postgres', '-h', '127.0.0.1']).status === 0;
      if (!ready) await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready, 'postgres did not start');
    run(`create role anon nologin; create role authenticated nologin; create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
      grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
      insert into auth.users values ('${provider}'), ('${member}'), ('${customer}'), ('${second}');
      create table public.profiles (id uuid primary key references auth.users(id), kind text not null default 'member');
      alter table public.profiles enable row level security;
      create policy profiles_read on public.profiles for select using (true);
      grant select on public.profiles to anon, authenticated;
      create table public.services (id uuid primary key, owner uuid references public.profiles(id), title text not null);
      insert into public.profiles values ('${provider}', 'provider'), ('${member}', 'member'), ('${customer}', 'member'), ('${second}', 'provider');`);
    run(migration);

    const yacht = run(`${as(provider)} ${insert(provider)}`);
    run(`${as(second)} ${insert(second, `'Chef privado', 50000, 180, 'dining'`)}`);
    run(`${as(member)} ${insert(member)}`, false);
    run(`${as(provider)} ${insert(second)}`, false);
    run(`${as(customer)} ${insert(customer)}`, false);
    for (const values of [`'Yate', -1, 60, 'water'`, `'Yate', 1, 0, 'water'`, `'', 1, 60, 'water'`, `' Yate', 1, 60, 'water'`, `'Yate', 1, 60, 'weapons'`]) {
      run(`${as(provider)} ${insert(provider, values)}`, false);
    }
    run(`${as(provider)} insert into public.provider_services (provider_id, name, price_cents, duration_minutes, category, created_at) values ('${provider}', 'x', 1, 1, 'water', now());`, false);
    assert.match(run(`${as(null, 'anon')} select count(*) from public.provider_services;`, false), /permission denied/);
    pass('only approved providers insert, only as themselves, and the table checks hold');

    assert.equal(run(`${as(customer)} update public.provider_services set price_cents = 1 returning 1;`), '');
    assert.equal(run(`${as(second)} update public.provider_services set active = false where id = '${yacht}' returning 1;`), '');
    run(`${as(provider)} update public.provider_services set provider_id = '${second}' where id = '${yacht}';`, false);
    run(`${as(provider)} delete from public.provider_services where id = '${yacht}';`, false);
    run(`${as(provider)} update public.provider_services set price_cents = 160000, description = 'Sandbar' where id = '${yacht}';`);
    assert.equal(run(`select provider_id || ':' || price_cents || ':' || (updated_at >= created_at) from public.provider_services where id = '${yacht}';`), `${provider}:160000:true`);
    pass('only the owner updates; owner cannot change and nothing can be deleted');

    assert.equal(run(`${as(customer)} ${search()}`), 'Chef privado,Yate');
    assert.equal(run(`${as(customer)} ${search(`search_category => 'water'`)}`), 'Yate');
    assert.equal(run(`${as(customer)} ${search(`search_provider => '${second}'`)}`), 'Chef privado');
    assert.equal(run(`${as(customer)} ${search(`search_text => 'sand'`)}`), 'Yate');
    assert.equal(run(`${as(customer)} ${search(`search_text => '%'`)}`), '');
    assert.equal(run(`${as(customer)} ${search(`result_limit => 1`)}`).split(',').length, 1);
    assert.match(run(`${as(null, 'anon')} ${search()}`, false), /permission denied/);
    pass('search filters by category, provider and literal text');

    run(`${as(provider)} update public.provider_services set active = false where id = '${yacht}';`);
    assert.equal(run(`${as(customer)} ${search()}`), 'Chef privado');
    assert.equal(run(`${as(customer)} select count(*) from public.provider_services where id = '${yacht}';`), '0');
    assert.equal(run(`${as(provider)} select count(*) from public.provider_services where id = '${yacht}';`), '1');
    run(`update public.profiles set kind = 'member' where id = '${second}';`);
    assert.equal(run(`${as(customer)} ${search()}`), '');
    assert.equal(run(`${as(customer)} select count(*) from public.provider_services;`), '0');
    run(`${as(second)} update public.provider_services set active = true;`, false);
    run(`${as(second)} update public.provider_services set active = false;`);
    pass('inactive services and demoted providers drop out of public reads; owners still see theirs and can deactivate');
  } finally {
    docker(['rm', '--force', '--volumes', name]);
  }
}

main().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
