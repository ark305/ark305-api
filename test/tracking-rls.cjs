// Optional probe: applies the tracking migration to an isolated postgres:17 container (no network, never pulls images).
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const name = `ark305-tracking-rls-${randomBytes(12).toString('hex')}`;
const migrations = ['20261031031940_service_requests.sql', '20261102232604_request_management.sql', '20261114010000_provider_locations.sql']
  .map(file => fs.readFileSync(path.resolve(__dirname, '../supabase/migrations', file), 'utf8'));
const [providerA, providerB, member, operator, offDuty, stale] = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666'];
const docker = (args, input) => spawnSync('docker', args, { encoding: 'utf8', input, timeout: 30000 });
const run = (script, ok = true) => {
  const result = docker(['exec', '-i', name, 'psql', '-U', 'postgres', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], script);
  if (ok) assert.equal(result.status, 0, result.stderr); else assert.equal(result.status, 3, 'expected a SQL error');
  return ok ? result.stdout.trim() : result.stderr;
};
const as = (id, role = 'authenticated') => `set role ${role}; set request.jwt.claims = '${JSON.stringify(id ? { sub: id, role } : { role })}';`;
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
    const users = [providerA, providerB, member, operator, offDuty, stale];
    run(`create role anon nologin; create role authenticated nologin; create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
      grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
      insert into auth.users values ${users.map(id => `('${id}')`).join(',')};
      create table public.profiles (id uuid primary key references auth.users(id), kind text not null default 'member');
      grant select on public.profiles to anon, authenticated;
      insert into public.profiles values ('${providerA}', 'provider'), ('${providerB}', 'provider'), ('${member}', 'member'),
        ('${operator}', 'member'), ('${offDuty}', 'provider'), ('${stale}', 'provider');`);
    for (const migration of migrations) run(migration);
    run(`insert into public.request_administrators (user_id) values ('${operator}');`);

    run(`${as(providerA)} insert into public.provider_locations (provider_id, latitude, longitude, accuracy_m) values ('${providerA}', 25.7617, -80.1918, 12);`);
    run(`${as(providerA)} insert into public.provider_locations (provider_id, latitude, longitude) values ('${providerA}', 25.77, -80.19)
      on conflict (provider_id) do update set provider_id = excluded.provider_id, latitude = excluded.latitude, longitude = excluded.longitude, accuracy_m = excluded.accuracy_m, on_duty = excluded.on_duty;`);
    assert.equal(run(`select count(*) || ':' || latitude from public.provider_locations group by latitude;`), '1:25.77');
    pass('provider upserts keep exactly one current row');
    run(`${as(providerA)} insert into public.provider_locations (provider_id, latitude, longitude) values ('${providerB}', 25.7, -80.2);`, false);
    run(`${as(member)} insert into public.provider_locations (provider_id, latitude, longitude) values ('${member}', 25.7, -80.2);`, false);
    run(`${as(providerA)} insert into public.provider_locations (provider_id, latitude, longitude, recorded_at) values ('${providerA}', 25.7, -80.2, now());`, false);
    run(`${as(null, 'anon')} insert into public.provider_locations (provider_id, latitude, longitude) values ('${providerA}', 25.7, -80.2);`, false);
    run(`${as(providerA)} update public.provider_locations set latitude = 95;`, false);
    pass('only provider profiles write their own row; recorded_at, other providers, anon and bad coordinates are rejected');

    run(`${as(providerB)} insert into public.provider_locations (provider_id, latitude, longitude) values ('${providerB}', 25.80, -80.13);`);
    run(`${as(offDuty)} insert into public.provider_locations (provider_id, latitude, longitude, on_duty) values ('${offDuty}', 25.77, -80.19, false);`);
    run(`${as(stale)} insert into public.provider_locations (provider_id, latitude, longitude) values ('${stale}', 25.77, -80.19);`);
    run(`set session_replication_role = replica; update public.provider_locations set recorded_at = now() - interval '16 minutes' where provider_id = '${stale}';`);
    assert.equal(run(`${as(providerB)} update public.provider_locations set latitude = 0 where provider_id = '${providerA}' returning 1;`), '');
    assert.equal(run(`${as(member)} select count(*) from public.provider_locations;`), '0');
    assert.equal(run(`${as(providerA)} select string_agg(provider_id::text, ',') from public.provider_locations;`), providerA);
    assert.equal(run(`${as(operator)} select count(*) from public.provider_locations;`), '4');
    pass('providers cannot touch other rows; members read nothing; operators read every location');

    const nearby = viewer => run(`${as(viewer)} select string_agg(concat_ws('|', provider_id, distance_km, coalesce(latitude::text, '-'), age_seconds < 60), ',') from public.nearby_providers(25.7617, -80.1918, 10);`);
    const memberView = nearby(member).split(','); const operatorView = nearby(operator).split(',');
    assert.deepEqual(memberView.map(row => row.split('|')[0]), [providerA, providerB]);
    assert.deepEqual(operatorView.map(row => row.split('|')[0]), [providerA, providerB]);
    assert.ok(memberView.every(row => row.split('|')[2] === '-' && /^\d+(\.\d)?$/.test(row.split('|')[1])), memberView.join(','));
    assert.equal(operatorView[0].split('|')[2], '25.77');
    const exactKm = Number(operatorView[1].split('|')[1]);
    assert.ok(exactKm > 7.4 && exactKm < 7.6, String(exactKm));
    assert.equal(run(`${as(member)} select count(*) from public.nearby_providers(25.7617, -80.1918, 1);`), '1');
    assert.equal(run(`${as(member)} select count(*) from public.nearby_providers(25.7617, -80.1918, 50);`), '2');
    pass('nearby excludes stale, off-duty and out-of-radius rows; only operators see coordinates');
    run(`${as(member)} select * from public.nearby_providers(25.7617, -80.1918, 51);`, false);
    run(`${as(member)} select * from public.nearby_providers(91, -80.1918, 5);`, false);
    run(`${as(null, 'anon')} select * from public.nearby_providers(25.7617, -80.1918, 5);`, false);
    run(`${as(null)} select * from public.nearby_providers(25.7617, -80.1918, 5);`, false);
    pass('nearby rejects invalid searches, anon callers and missing identity');
  } finally {
    docker(['rm', '--force', '--volumes', name]);
  }
}

main().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
