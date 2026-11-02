const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { spawnSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const image = 'postgres:17';
const containerName = `ark305-requests-rls-${randomBytes(12).toString('hex')}`;
const password = randomBytes(24).toString('hex');
const migrationPath = path.resolve(__dirname, '../../supabase/migrations/20261031031940_service_requests.sql');
const managementPath = path.resolve(__dirname, '../../supabase/migrations/20261102232604_request_management.sql');
const ownerA = '11111111-1111-4111-8111-111111111111';
const ownerB = '33333333-3333-4333-8333-333333333333';

function localDockerHost() {
  if (process.platform === 'win32') return 'npipe:////./pipe/docker_engine';
  if (process.platform === 'linux') return 'unix:///var/run/docker.sock';
  throw new Error('The isolated RLS probe supports only a local Windows or Linux Docker engine.');
}

const dockerHost = localDockerHost();

function docker(args, options = {}) {
  return spawnSync('docker', ['--host', dockerHost, ...args], {
    encoding: 'utf8',
    timeout: options.timeout ?? 15000,
    input: options.input,
    windowsHide: true,
  });
}

function requireSuccess(result, label) {
  if (result.error || result.status !== 0) {
    const processError = result.error ? ` Process error: ${result.error.code || result.error.name}.` : '';
    const postgresErrors = (result.stderr || '').split(/\r?\n/)
      .filter((line) => /^(ERROR|FATAL|DETAIL|HINT|psql: error:)/i.test(line))
      .slice(0, 3)
      .map((line) => line.replace(/(password|token|secret)\s*[=:]\s*\S+/gi, '$1=[redacted]'));
    const diagnostic = postgresErrors.length ? ` ${postgresErrors.join(' ')}` : '';
    throw new Error(`${label} failed.${processError}${diagnostic} Confirm Docker is running locally and ${image} is already available; this test never pulls images.`);
  }
  return result.stdout.trim();
}

function setIdentity(ownerId, role = 'authenticated') {
  const claims = JSON.stringify({ ...(ownerId ? { sub: ownerId } : {}), role });
  return `SET ROLE ${role};\nSET request.jwt.claims = '${claims}';\n`;
}

function sql(script, label, expectSuccess = true) {
  const result = docker([
    'exec', '-i', containerName, 'psql', '-U', 'postgres', '-d', 'ark305_test',
    '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1',
  ], { input: script, timeout: 15000 });
  if (expectSuccess) return requireSuccess(result, label);
  assert.ifError(result.error);
  assert.equal(result.status, 3, `${label} must fail with a SQL error, not a Docker or process failure`);
  assert.match(result.stderr, /ERROR:/, `${label} must report a PostgreSQL error`);
  return (result.stderr || result.stdout).trim();
}

function expectValue(script, expected, label) {
  assert.equal(sql(script, label), expected, label);
  process.stdout.write(`PASS ${label}\n`);
}

function concurrentSql(script) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['--host', dockerHost, 'exec', '-i', containerName,
      'psql', '-U', 'postgres', '-d', 'ark305_test', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'],
    { windowsHide: true, timeout: 15000 });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', value => { stdout += value; });
    child.stderr.on('data', value => { stderr += value; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr)));
    child.stdin.end(script);
  });
}

function tableHash() {
  return sql(
    "SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text, '[]')) FROM public.service_requests AS t;",
    'hash current request rows',
  );
}

function expectRejectedWithoutMutation(script, label) {
  const before = tableHash();
  sql(script, label, false);
  assert.equal(tableHash(), before, `${label} changed persisted rows`);
  process.stdout.write(`PASS rejected without mutation: ${label}\n`);
}

async function waitForPostgres() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const result = docker([
      'exec', containerName, 'pg_isready', '-h', '127.0.0.1', '-p', '5432', '-U', 'postgres', '-d', 'ark305_test',
    ], { timeout: 3000 });
    if (!result.error && result.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('The isolated PostgreSQL container did not become ready within 30 seconds.');
}

async function main() {
  if (!fs.existsSync(migrationPath)) throw new Error('The service-request migration file is missing.');
  const migration = fs.readFileSync(migrationPath, 'utf8');
  if (!migration.trim()) throw new Error('The service-request migration file is empty.');

  let created = false;
  let failure;
  try {
    const containerId = requireSuccess(docker([
      'create', '--pull=never', '--network=none', '--name', containerName,
      '--env', `POSTGRES_PASSWORD=${password}`,
      '--env', 'POSTGRES_USER=postgres',
      '--env', 'POSTGRES_DB=ark305_test',
      image,
    ], { timeout: 30000 }), 'create isolated PostgreSQL container');
    created = true;
    if (!containerId) throw new Error('Docker did not return the isolated container identity.');

    requireSuccess(docker(['start', containerName], { timeout: 15000 }), 'start isolated PostgreSQL container');
    await waitForPostgres();

    const setup = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
INSERT INTO auth.users (id) VALUES ('${ownerA}'), ('${ownerB}');
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
`;
    sql(setup, 'create isolated Supabase auth test surface');
    sql(migration, 'apply repository migration to isolated PostgreSQL');

    const insert = `INSERT INTO public.service_requests (service_id, requested_date, guests, preferences)
VALUES ('yacht', '2027-01-15', 4, 'Sunset')
RETURNING requester_id::text || ':' || status;`;
    expectValue(setIdentity(ownerA) + insert, `${ownerA}:received`, 'owner A inserts a received request');
    expectValue(setIdentity(ownerB) + insert, `${ownerB}:received`, 'owner B inserts a received request');

    expectValue(setIdentity(ownerA) + 'SELECT count(*) FROM public.service_requests;', '1', 'owner A sees only one row');
    expectValue(setIdentity(ownerB) + 'SELECT count(*) FROM public.service_requests;', '1', 'owner B sees only one row');
    expectValue(setIdentity(ownerA) + `SELECT count(*) FROM public.service_requests WHERE requester_id = '${ownerB}';`, '0', 'owner A cannot read owner B rows');
    expectValue(setIdentity(ownerB) + `SELECT count(*) FROM public.service_requests WHERE requester_id = '${ownerA}';`, '0', 'owner B cannot read owner A rows');

    for (const [column, value] of [
      ['requester_id', `'${ownerB}'`],
      ['status', "'confirmed'"],
      ['id', "'22222222-2222-4222-8222-222222222222'"],
      ['created_at', "'2000-01-01'::timestamptz"],
    ]) {
      expectRejectedWithoutMutation(
        setIdentity(ownerA) + `INSERT INTO public.service_requests (service_id, requested_date, guests, ${column}) VALUES ('yacht', '2027-01-15', 4, ${value});`,
        `insert cannot set ${column}`,
      );
    }

    expectRejectedWithoutMutation(setIdentity(null, 'anon') + 'SELECT * FROM public.service_requests;', 'anon cannot select requests');
    expectRejectedWithoutMutation(setIdentity(null, 'anon') + insert, 'anon cannot insert requests');
    expectRejectedWithoutMutation(setIdentity(ownerA) + "UPDATE public.service_requests SET preferences = 'changed';", 'authenticated cannot update requests');
    expectRejectedWithoutMutation(setIdentity(ownerA) + 'DELETE FROM public.service_requests;', 'authenticated cannot delete requests');

    for (const [label, values] of [
      ['guests below minimum', "'yacht', '2027-01-15', 0, ''"],
      ['guests above maximum', "'yacht', '2027-01-15', 21, ''"],
      ['empty service id', "'', '2027-01-15', 4, ''"],
      ['oversized service id', "repeat('x', 65), '2027-01-15', 4, ''"],
      ['oversized preferences', "'yacht', '2027-01-15', 4, repeat('x', 2001)"],
      ['invalid calendar date', "'yacht', '2027-02-30', 4, ''"],
    ]) {
      expectRejectedWithoutMutation(
        setIdentity(ownerA) + `INSERT INTO public.service_requests (service_id, requested_date, guests, preferences) VALUES (${values});`,
        `database constraint: ${label}`,
      );
    }

    expectValue(setIdentity(null) + 'SELECT count(*) FROM public.service_requests;', '0', 'authenticated without identity cannot read requests');
    expectRejectedWithoutMutation(setIdentity(null) + insert, 'authenticated without identity cannot insert requests');
    expectValue('SELECT count(*) FROM public.service_requests;', '2', 'rejected statements leave exactly two rows');
    expectValue("SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.service_requests'::regclass;", 'true', 'row-level security is enabled');
    expectValue("SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'service_requests' AND indexname = 'service_requests_owner_created_idx';", '1', 'owner and creation-order index exists');

    sql(fs.readFileSync(managementPath, 'utf8'), 'apply request management migration');
    await require('./request-management-probe.cjs')({ sql, expectValue, setIdentity, concurrentSql, ownerA, ownerB });
    process.stdout.write('PASS PostgreSQL 17 migration/RLS probe with simulated Supabase Auth claims\n');
  } catch (error) {
    failure = error;
  } finally {
    if (created) {
      const removed = docker(['rm', '--force', '--volumes', containerName], { timeout: 15000 });
      if ((removed.error || removed.status !== 0) && !failure) {
        failure = new Error('Failed to remove the test container created by this probe.');
      }
    }
  }

  if (failure) throw failure;
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
