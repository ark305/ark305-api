// Optional probe: applies the GHL provider-accounts migration to an isolated postgres:17 container (no network, never pulls images).
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const name = `ark305-ghl-accounts-${randomBytes(12).toString('hex')}`;
const migration = fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/20261114030000_ghl_provider_accounts.sql'), 'utf8');
const [provider, member, operator, customer] = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
const SEALED = 'v1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB.CCCC';
const docker = (args, input) => spawnSync('docker', args, { encoding: 'utf8', input, timeout: 30000 });
const run = (script, ok = true) => {
  const result = docker(['exec', '-i', name, 'psql', '-U', 'postgres', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], script);
  if (ok) assert.equal(result.status, 0, result.stderr); else assert.equal(result.status, 3, `expected a SQL error: ${result.stdout}`);
  return ok ? result.stdout.trim() : result.stderr;
};
const as = (id, role = 'authenticated') => `set role ${role}; set request.jwt.claims = '${JSON.stringify(id ? { sub: id, role } : { role })}';`;
const insert = (id, location = 'provLoc', token = SEALED) =>
  `insert into public.ghl_provider_accounts (provider_id, location_id, token_ciphertext) values ('${id}', '${location}', '${token}');`;
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
      insert into auth.users values ('${provider}'), ('${member}'), ('${operator}'), ('${customer}');
      create table public.profiles (id uuid primary key references auth.users(id), kind text not null default 'member');
      grant select on public.profiles to authenticated;
      insert into public.profiles values ('${provider}', 'provider'), ('${member}', 'member'), ('${operator}', 'member'), ('${customer}', 'member');
      create table public.request_administrators (user_id uuid primary key references auth.users(id));
      alter table public.request_administrators enable row level security;
      create policy own on public.request_administrators for select to authenticated using (user_id = auth.uid());
      grant select on public.request_administrators to authenticated;
      insert into public.request_administrators values ('${operator}');`);
    run(migration);

    run(`${as(provider)} ${insert(provider)}`);
    run(`${as(member)} ${insert(member)}`, false);
    assert.match(run(`${as(provider)} insert into public.ghl_provider_accounts (provider_id, location_id, token_ciphertext) values ('${provider}', 'provLoc', '${SEALED}')
      on conflict (provider_id) do update set token_ciphertext = excluded.token_ciphertext;`, false), /permission denied/);
    assert.equal(run(`${as(provider)} update public.ghl_provider_accounts set location_id = 'provLoc', token_ciphertext = '${SEALED}'
      where provider_id = '${provider}' returning provider_id, location_id;`), `${provider}|provLoc`);
    run(`${as(provider)} ${insert(customer)}`, false);
    run(`${as(provider)} ${insert(provider, 'bad id')}`, false);
    run(`${as(provider)} insert into public.ghl_provider_accounts (provider_id, location_id, token_ciphertext) values ('${provider}', 'x', 'plain-token');`, false);
    run(`${as(provider)} insert into public.ghl_provider_accounts (provider_id, location_id, token_ciphertext, connected_at) values ('${provider}', 'x', '${SEALED}', now());`, false);
    pass('only an approved provider can store their own account, only sealed; reconnecting is an update (upsert cannot read the token)');

    assert.match(run(`${as(provider)} select token_ciphertext from public.ghl_provider_accounts;`, false), /permission denied/);
    assert.match(run(`${as(operator)} select * from public.ghl_provider_accounts;`, false), /permission denied/);
    assert.equal(run(`${as(provider)} select location_id from public.ghl_provider_accounts;`), 'provLoc');
    assert.equal(run(`${as(operator)} select provider_id from public.ghl_provider_accounts;`), provider);
    assert.equal(run(`${as(customer)} select count(*) from public.ghl_provider_accounts;`), '0');
    assert.match(run(`${as(null, 'anon')} select provider_id from public.ghl_provider_accounts;`, false), /permission denied/);
    pass('nobody selects the sealed token; status is visible to its provider and operators only');

    assert.equal(run(`${as(operator)} update public.ghl_provider_accounts set location_id = 'evil' returning 1;`), '');
    assert.equal(run(`${as(operator)} delete from public.ghl_provider_accounts returning 1;`), '');
    assert.equal(run(`${as(customer)} update public.ghl_provider_accounts set token_ciphertext = '${SEALED}x' returning 1;`), '');
    run(`${as(provider)} update public.ghl_provider_accounts set provider_id = '${customer}';`, false);
    const before = run(`select connected_at from public.ghl_provider_accounts;`);
    run(`select pg_sleep(0.05); ${as(provider)} update public.ghl_provider_accounts set pipeline_id = 'pipe1';`);
    assert.equal(run(`select connected_at from public.ghl_provider_accounts;`), before);
    run(`select pg_sleep(0.05); ${as(provider)} update public.ghl_provider_accounts set token_ciphertext = '${SEALED}D';`);
    assert.notEqual(run(`select connected_at from public.ghl_provider_accounts;`), before);
    run(`${as(provider)} update public.ghl_provider_accounts set pipeline_stage_id = 's1', pipeline_id = null;`, false);
    pass('only the owner edits; reconnecting restamps connected_at, pipeline edits do not');

    assert.equal(run(`${as(customer)} select location_id || ':' || coalesce(pipeline_id, '') || ':' || token_ciphertext from public.ghl_provider_credentials('${provider}');`), `provLoc:pipe1:${SEALED}D`);
    assert.equal(run(`${as(customer)} select count(*) from public.ghl_provider_credentials('${member}');`), '0');
    assert.match(run(`${as(null, 'anon')} select * from public.ghl_provider_credentials('${provider}');`, false), /permission denied/);
    assert.match(run(`${as(null)} select * from public.ghl_provider_credentials('${provider}');`, false), /Authentication required/);
    run(`update public.profiles set kind = 'member' where id = '${provider}';`);
    assert.equal(run(`${as(customer)} select count(*) from public.ghl_provider_credentials('${provider}');`), '0');
    run(`${as(provider)} update public.ghl_provider_accounts set pipeline_id = 'pipe2';`, false);
    assert.equal(run(`${as(provider)} delete from public.ghl_provider_accounts returning 1;`), '1');
    pass('the sealed value is served only for current providers; a demoted provider can still disconnect');
  } finally {
    docker(['rm', '--force', '--volumes', name]);
  }
}

main().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
