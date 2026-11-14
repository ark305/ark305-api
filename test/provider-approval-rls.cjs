// Optional probe: applies the provider-approval migration to an isolated postgres:17 container (no network, never pulls images).
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const name = `ark305-provider-approval-${randomBytes(12).toString('hex')}`;
const migrations = ['20261031031940_service_requests.sql', '20261102232604_request_management.sql', '20261114020000_provider_approval.sql']
  .map(file => fs.readFileSync(path.resolve(__dirname, '../supabase/migrations', file), 'utf8'));
const [member, other, operator, legacy] = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555'];
const docker = (args, input) => spawnSync('docker', args, { encoding: 'utf8', input, timeout: 30000 });
const run = (script, ok = true) => {
  const result = docker(['exec', '-i', name, 'psql', '-U', 'postgres', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], script);
  if (ok) assert.equal(result.status, 0, result.stderr); else assert.equal(result.status, 3, `expected a SQL error: ${result.stdout}`);
  return ok ? result.stdout.trim() : result.stderr;
};
const as = (id, role = 'authenticated') => `set role ${role}; set request.jwt.claims = '${JSON.stringify(id ? { sub: id, role } : { role })}';`;
const kindOf = id => run(`select kind from public.profiles where id = '${id}';`);
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
      insert into auth.users values ('${member}'), ('${other}'), ('${operator}'), ('${legacy}');
      create table public.profiles (id uuid primary key references auth.users(id), handle text not null default '', kind text not null default 'member'
        check (kind in ('member', 'provider', 'creator', 'remote', 'brand')));
      alter table public.profiles enable row level security;
      grant select, insert, update on public.profiles to anon, authenticated;
      create policy profiles_read on public.profiles for select using (true);
      create policy profiles_insert on public.profiles for insert with check (id = auth.uid());
      create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
      insert into public.profiles (id, kind) values ('${member}', 'member'), ('${operator}', 'member'), ('${legacy}', 'provider');`);
    for (const migration of migrations) run(migration);
    run(`insert into public.request_administrators (user_id) values ('${operator}');`);

    run(`${as(member)} update public.profiles set kind = 'provider' where id = '${member}';`, false);
    run(`${as(other)} insert into public.profiles (id, kind) values ('${other}', 'provider');`, false);
    run(`${as(operator)} update public.profiles set kind = 'provider' where id = '${operator}';`, false);
    run(`${as(other)} insert into public.profiles (id, kind) values ('${other}', 'creator');`);
    run(`${as(member)} update public.profiles set kind = 'creator', handle = 'ada' where id = '${member}';`);
    run(`${as(legacy)} update public.profiles set kind = 'provider', handle = 'legacy' where id = '${legacy}';`);
    assert.deepEqual([kindOf(member), kindOf(other), kindOf(legacy)], ['creator', 'creator', 'provider']);
    pass('members, new profiles and operators cannot self-assign provider; other kinds and existing providers still edit');

    run(`${as(null, 'anon')} select * from public.request_provider_role();`, false);
    run(`${as(legacy)} select * from public.request_provider_role();`, false);
    run(`${as(member)} insert into public.provider_applications (user_id, status, decided_at) values ('${member}', 'approved', now());`, false);
    assert.equal(run(`${as(member)} select user_id || ':' || status from public.request_provider_role();`), `${member}:pending`);
    assert.equal(run(`${as(member)} select count(*) from public.request_provider_role();`), '1');
    assert.equal(run(`${as(other)} select user_id || ':' || status from public.request_provider_role();`), `${other}:pending`);
    run(`${as(member)} update public.provider_applications set status = 'approved', decided_at = now();`, false);
    assert.equal(run(`${as(member)} select string_agg(user_id::text, ',') from public.provider_applications;`), member);
    assert.equal(run(`${as(operator)} select count(*) from public.provider_applications where status = 'pending';`), '2');
    pass('applications are idempotent, self-readable, operator-readable and not directly writable');

    run(`${as(member)} select * from public.decide_provider_application('${member}', true);`, false);
    assert.equal(kindOf(member), 'creator');
    assert.equal(run(`${as(operator)} select status || ':' || (decided_by = '${operator}') from public.decide_provider_application('${member}', true);`), 'approved:true');
    assert.equal(kindOf(member), 'provider');
    assert.equal(run(`${as(operator)} select status from public.decide_provider_application('${other}', false);`), 'rejected');
    assert.equal(kindOf(other), 'creator');
    assert.equal(run(`${as(operator)} select count(*) from public.decide_provider_application('${other}', true);`), '0');
    assert.equal(kindOf(other), 'creator');
    pass('only operators decide; approval sets provider, rejection and repeat decisions change nothing');

    run(`${as(member)} update public.profiles set kind = 'member' where id = '${member}';`);
    run(`${as(member)} update public.profiles set kind = 'provider' where id = '${member}';`, false);
    assert.equal(run(`${as(member)} select status from public.request_provider_role();`), 'pending');
    assert.equal(run(`${as(other)} select status from public.request_provider_role();`), 'pending');
    pass('dropping provider requires a fresh approval; rejected members can re-apply');
  } finally {
    docker(['rm', '--force', '--volumes', name]);
  }
}

main().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
