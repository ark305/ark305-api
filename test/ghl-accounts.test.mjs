import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'node:http';
import { GhlClient } from '../dist/modules/ghl/ghl.client.js';
import { GhlService } from '../dist/modules/ghl/ghl.service.js';
import { GhlAccountsService, parseAccountInput, parseProviderId } from '../dist/modules/ghl/ghl-accounts.service.js';
import { ghlCredentialsKeyConfigured, openGhlToken, sealGhlToken } from '../dist/modules/ghl/ghl-credentials.js';
import { createApp } from '../dist/application.js';

const KEY = { GHL_CREDENTIALS_KEY: 'k'.repeat(40) };
const provider = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const operator = '33333333-3333-4333-8333-333333333333';
const PIT = 'pit-provider-0123456789abcdef';
const DEFAULT = { apiKey: 'ark-token', locationId: 'arkLoc', baseUrl: new URL('https://services.leadconnectorhq.com'), pipelineId: 'arkPipe', pipelineStageId: 'arkStage' };
const status = async promise => { try { await promise; } catch (error) { return error.getStatus(); } return 200; };
const body = async promise => { try { await promise; } catch (error) { return error.getResponse(); } return null; };

function withEnv(values, fn) {
  const saved = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  const restore = () => { for (const [key, value] of Object.entries(saved)) value === undefined ? delete process.env[key] : process.env[key] = value; };
  return Promise.resolve().then(fn).finally(restore);
}

function setup({ kind = 'provider', valid = true, stored = {}, operators = [operator] } = {}) {
  const calls = { verify: [], saved: [], removed: [] };
  const client = {
    config: () => DEFAULT,
    baseUrl: () => DEFAULT.baseUrl,
    verifyCredentials: async (apiKey, locationId) => { calls.verify.push({ apiKey, locationId }); return valid; },
  };
  const access = {
    isOperator: async (_token, id) => operators.includes(id),
    requireOperator: async (_token, id) => { if (!operators.includes(id)) { const error = new Error('forbidden'); error.getStatus = () => 403; throw error; } },
  };
  const port = {
    profileKind: async () => kind,
    credentials: async (_token, id) => stored[id] ?? null,
    save: async (_token, row) => { calls.saved.push(row); return { providerId: row.providerId, connected: true, locationId: row.locationId, pipelineId: row.pipelineId,
      pipelineStageId: row.pipelineStageId, connectedAt: '2027-01-01T00:00:00Z', updatedAt: '2027-01-01T00:00:00Z' }; },
    remove: async (_token, id) => { calls.removed.push(id); },
    status: async () => null,
    list: async () => [],
  };
  return { calls, service: new GhlAccountsService(client, access, port) };
}

const sealedFor = (id, locationId, extra = {}) => ({ [id]: { locationId, pipelineId: null, pipelineStageId: null, tokenCiphertext: sealGhlToken(PIT, id, locationId, KEY), ...extra } });

test('provider tokens are sealed with AES-GCM, bound to provider and location, and need GHL_CREDENTIALS_KEY', () => {
  assert.equal(ghlCredentialsKeyConfigured({}), false);
  assert.equal(ghlCredentialsKeyConfigured({ GHL_CREDENTIALS_KEY: 'short' }), false);
  assert.throws(() => sealGhlToken(PIT, provider, 'loc1', {}));
  const sealed = sealGhlToken(PIT, provider, 'loc1', KEY);
  assert.match(sealed, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.ok(!sealed.includes(PIT) && !sealed.includes(Buffer.from(PIT).toString('base64url')));
  assert.notEqual(sealGhlToken(PIT, provider, 'loc1', KEY), sealed);
  assert.equal(openGhlToken(sealed, provider, 'loc1', KEY), PIT);
  assert.equal(openGhlToken(sealed, other, 'loc1', KEY), null);
  assert.equal(openGhlToken(sealed, provider, 'loc2', KEY), null);
  assert.equal(openGhlToken(sealed, provider, 'loc1', { GHL_CREDENTIALS_KEY: 'x'.repeat(40) }), null);
  assert.equal(openGhlToken(`${sealed.slice(0, -2)}AA`, provider, 'loc1', KEY), null);
  assert.equal(openGhlToken('garbage', provider, 'loc1', KEY), null);
});

test('account input accepts only location, token and optional pipeline/stage', () => {
  assert.deepEqual(parseAccountInput({ locationId: ' loc1 ', token: ` ${PIT} ` }), { locationId: 'loc1', token: PIT, pipelineId: null, pipelineStageId: null });
  assert.deepEqual(parseAccountInput({ locationId: 'loc1', token: PIT, pipelineId: 'p1', pipelineStageId: 's1' }).pipelineStageId, 's1');
  for (const input of [null, [], {}, { locationId: 'loc1' }, { token: PIT }, { locationId: 'bad id', token: PIT }, { locationId: 'loc1', token: 'short' },
    { locationId: 'loc1', token: 'has space in the token value' }, { locationId: 'loc1', token: PIT, pipelineStageId: 's1' },
    { locationId: 'loc1', token: PIT, providerId: other }, { locationId: 'loc1', token: PIT, pipelineId: '../x' }]) {
    assert.throws(() => parseAccountInput(input), error => error.getStatus() === 400, JSON.stringify(input));
  }
  assert.equal(parseProviderId(undefined), undefined);
  assert.equal(parseProviderId(provider.toUpperCase()), provider);
  assert.throws(() => parseProviderId('nope'), error => error.getStatus() === 400);
});

test('connect validates the token against GHL first, then stores only the sealed token', () => withEnv(KEY, async () => {
  const ok = setup();
  const result = await ok.service.connect('jwt', provider, parseAccountInput({ locationId: 'provLoc', token: PIT, pipelineId: 'provPipe' }));
  assert.deepEqual(ok.calls.verify, [{ apiKey: PIT, locationId: 'provLoc' }]);
  assert.equal(ok.calls.saved.length, 1);
  const saved = ok.calls.saved[0];
  assert.equal(saved.providerId, provider);
  assert.ok(!JSON.stringify(saved).includes(PIT));
  assert.equal(openGhlToken(saved.tokenCiphertext, provider, 'provLoc'), PIT);
  assert.ok(!JSON.stringify(result).includes(PIT) && !JSON.stringify(result).includes(saved.tokenCiphertext));
  assert.equal(result.connected, true);

  const invalid = setup({ valid: false });
  assert.deepEqual(await body(invalid.service.connect('jwt', provider, parseAccountInput({ locationId: 'provLoc', token: PIT }))), { error: 'ghl_invalid_credentials' });
  assert.equal(invalid.calls.saved.length, 0);

  const member = setup({ kind: 'member' });
  assert.equal(await status(member.service.connect('jwt', provider, parseAccountInput({ locationId: 'provLoc', token: PIT }))), 403);
  assert.equal(member.calls.verify.length, 0);
}));

test('connect fails closed without GHL_CREDENTIALS_KEY and disconnect removes only the caller', async () => {
  await withEnv({ GHL_CREDENTIALS_KEY: '' }, async () => {
    const { service, calls } = setup();
    assert.deepEqual(await body(service.connect('jwt', provider, parseAccountInput({ locationId: 'provLoc', token: PIT }))), { error: 'ghl_credentials_unavailable' });
    assert.equal(calls.verify.length, 0);
  });
  const { service, calls } = setup();
  assert.equal((await service.disconnect('jwt', provider)).connected, false);
  assert.deepEqual(calls.removed, [provider]);
});

test('per-provider credential selection: the connected account, its location and its own pipeline', () => withEnv(KEY, async () => {
  const { service } = setup({ stored: sealedFor(provider, 'provLoc', { pipelineId: 'provPipe', pipelineStageId: 'provStage' }) });
  for (const viewer of [provider, operator]) {
    const account = await service.resolve('jwt', viewer, provider, 'write');
    assert.deepEqual({ ...account, baseUrl: account.baseUrl.href },
      { apiKey: PIT, locationId: 'provLoc', baseUrl: 'https://services.leadconnectorhq.com/', pipelineId: 'provPipe', pipelineStageId: 'provStage' });
  }
  assert.equal((await service.resolve('jwt', other, provider, 'read')).apiKey, PIT);
  assert.equal(await status(service.resolve('jwt', other, provider, 'write')), 403);

  const ghlCalls = [];
  const ghl = new GhlService({ config: () => DEFAULT, request: async (request, config) => { ghlCalls.push({ request, config });
    return { opportunity: { id: 'o1' }, calendars: [], contact: { id: 'c1' } }; } });
  await ghl.createServiceOrder({ contactId: 'c1', name: 'Yate' }, await service.resolve('jwt', provider, provider, 'write'));
  await ghl.listCalendars(await service.resolve('jwt', other, provider, 'read'));
  assert.deepEqual(ghlCalls.map(call => [call.config.apiKey, call.request.body?.locationId ?? call.request.query.locationId]), [[PIT, 'provLoc'], [PIT, 'provLoc']]);
  assert.equal(ghlCalls[0].request.body.pipelineId, 'provPipe');
  assert.equal(ghlCalls[0].request.body.pipelineStageId, 'provStage');
}));

test('fallback to the default account: no providerId, or a provider that has not connected', () => withEnv(KEY, async () => {
  const { service } = setup();
  assert.equal(await service.resolve('jwt', operator, undefined, 'write'), undefined);
  assert.equal(await status(service.resolve('jwt', provider, undefined, 'write')), 403);
  assert.equal(await service.resolve('jwt', other, undefined, 'read'), undefined);
  assert.equal(await service.resolve('jwt', other, provider, 'read'), undefined);
  assert.equal(await service.resolve('jwt', operator, provider, 'write'), undefined);
  assert.deepEqual(await body(service.resolve('jwt', provider, provider, 'write')), { error: 'ghl_account_not_connected' });

  const ghlCalls = [];
  const ghl = new GhlService({ config: () => DEFAULT, request: async (request, config) => { ghlCalls.push({ request, config }); return { contact: { id: 'c1' } }; } });
  await ghl.upsertContact({ email: 'ana@ark305.com' }, await service.resolve('jwt', operator, provider, 'write'));
  assert.deepEqual([ghlCalls[0].config.apiKey, ghlCalls[0].request.body.locationId], ['ark-token', 'arkLoc']);
}));

test('a connected provider without a pipeline uses the default pipeline only inside the default location', () => withEnv({ ...KEY,
  GHL_API_KEY: 'ark-token', GHL_LOCATION_ID: 'arkLoc', GHL_PIPELINE_ID: 'arkPipe', GHL_PIPELINE_STAGE_ID: 'arkStage' }, async () => {
  const own = setup({ stored: sealedFor(provider, 'provLoc') });
  const account = await own.service.resolve('jwt', provider, provider, 'write');
  assert.equal(account.pipelineId, undefined);
  const ghl = new GhlService({ config: () => DEFAULT, request: async () => ({}) });
  assert.deepEqual(await body(ghl.createServiceOrder({ contactId: 'c1', name: 'Yate' }, account)), { error: 'ghl_pipeline_not_configured' });
  const shared = setup({ stored: sealedFor(provider, 'arkLoc') });
  const sharedAccount = await shared.service.resolve('jwt', provider, provider, 'write');
  assert.deepEqual([sharedAccount.apiKey, sharedAccount.pipelineId, sharedAccount.pipelineStageId], [PIT, 'arkPipe', 'arkStage']);
  const broken = setup({ stored: { [provider]: { ...sealedFor(other, 'provLoc')[other] } } });
  assert.deepEqual(await body(broken.service.resolve('jwt', provider, provider, 'read')), { error: 'ghl_credentials_unavailable' });
}));

test('GHL client verifies a candidate token with a calendars read and maps rejections', async (t) => {
  const seen = [];
  const server = createServer((req, res) => {
    seen.push({ url: req.url, authorization: req.headers.authorization, version: req.headers.version });
    res.setHeader('Content-Type', 'application/json');
    const code = { 'Bearer good-token-000000': 200, 'Bearer bad-token-0000000': 401, 'Bearer wrong-location-0': 403, 'Bearer busy-token-000000': 429 }[req.headers.authorization] ?? 500;
    res.statusCode = code; res.end(code === 200 ? '{"calendars":[]}' : '{"message":"Bearer secret echo"}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  await withEnv({ GHL_BASE_URL: `http://127.0.0.1:${server.address().port}`, GHL_API_KEY: '', GHL_LOCATION_ID: '' }, async () => {
    const client = new GhlClient();
    assert.equal(await client.verifyCredentials('good-token-000000', 'provLoc'), true);
    assert.deepEqual(seen[0], { url: '/calendars/?locationId=provLoc&showDrafted=false', authorization: 'Bearer good-token-000000', version: '2021-04-15' });
    assert.equal(await client.verifyCredentials('bad-token-0000000', 'provLoc'), false);
    assert.equal(await client.verifyCredentials('wrong-location-0', 'provLoc'), false);
    assert.equal(await status(client.verifyCredentials('busy-token-000000', 'provLoc')), 429);
    assert.deepEqual(await body(client.verifyCredentials('other-token-00000', 'provLoc')), { error: 'ghl_upstream' });
  });
});

test('migration keeps tokens sealed, unreadable from the table and writable only by approved providers', () => {
  const sql = fs.readFileSync(new URL('../supabase/migrations/20261114030000_ghl_provider_accounts.sql', import.meta.url), 'utf8');
  for (const invariant of [/provider_id uuid primary key references public\.profiles\(id\) on delete cascade/i, /enable row level security/i,
    /revoke all on public\.ghl_provider_accounts from public, anon, authenticated/i, /p\.kind = 'provider'/i,
    /security definer set search_path = ''/i, /grant execute on function public\.ghl_provider_credentials\(uuid\) to authenticated/i]) assert.match(sql, invariant);
  assert.doesNotMatch(sql.match(/grant select \(([^)]*)\)/i)[1], /token_ciphertext/);
  assert.doesNotMatch(sql, /grant select on public\.ghl_provider_accounts|to anon\b/i);
});

test('GHL account routes: connect, status, operator view, acting for a provider and disconnect over HTTP', async (t) => {
  const users = { 'Bearer provider': provider, 'Bearer customer': other, 'Bearer operator': operator };
  const rows = new Map();
  const ghlCalls = [];
  const responses = [];
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    let raw = ''; for await (const chunk of req) raw += chunk;
    const caller = users[req.headers.authorization];
    const url = new URL(req.url, 'http://x');
    if (req.url === '/auth/v1/user') return res.end(JSON.stringify({ id: caller ?? null }));
    if (url.pathname === '/rest/v1/request_administrators') return res.end(JSON.stringify(caller === operator ? [{ user_id: operator }] : []));
    if (url.pathname === '/rest/v1/profiles') { const id = url.searchParams.get('id').slice(3); return res.end(JSON.stringify([{ id, kind: id === provider ? 'provider' : 'member' }])); }
    if (url.pathname === '/rest/v1/rpc/ghl_provider_credentials') {
      const row = rows.get(JSON.parse(raw).provider);
      return res.end(JSON.stringify(row ? [{ location_id: row.location_id, pipeline_id: row.pipeline_id, pipeline_stage_id: row.pipeline_stage_id, token_ciphertext: row.token_ciphertext }] : []));
    }
    if (url.pathname === '/rest/v1/ghl_provider_accounts') {
      const view = ({ token_ciphertext, ...row }) => row;
      if (req.method === 'PATCH' || req.method === 'POST') {
        assert.ok(!url.searchParams.has('on_conflict'), 'upserts need SELECT on token_ciphertext');
        assert.equal(url.searchParams.get('select'), 'provider_id,location_id,pipeline_id,pipeline_stage_id,connected_at,updated_at');
      }
      if (req.method === 'PATCH') {
        const row = rows.get(url.searchParams.get('provider_id').slice(3));
        if (row) Object.assign(row, JSON.parse(raw), { updated_at: '2027-01-02T00:00:00Z' });
        return res.end(JSON.stringify(row ? [view(row)] : []));
      }
      if (req.method === 'POST') {
        const row = { ...JSON.parse(raw), connected_at: '2027-01-01T00:00:00Z', updated_at: '2027-01-01T00:00:00Z' };
        if (rows.has(row.provider_id)) { res.statusCode = 409; return res.end('{}'); }
        rows.set(row.provider_id, row); return res.end(JSON.stringify([view(row)]));
      }
      if (req.method === 'DELETE') { rows.delete(url.searchParams.get('provider_id').slice(3)); res.statusCode = 204; return res.end(); }
      const id = url.searchParams.get('provider_id')?.slice(3);
      return res.end(JSON.stringify([...rows.values()].filter(row => !id || row.provider_id === id).map(view)));
    }
    ghlCalls.push({ path: url.pathname, location: url.searchParams.get('locationId') ?? (raw && JSON.parse(raw).locationId), authorization: req.headers.authorization, body: raw && JSON.parse(raw) });
    if (!['Bearer ark-default-token', `Bearer ${PIT}`].includes(req.headers.authorization)) { res.statusCode = 401; return res.end('{}'); }
    if (url.pathname === '/calendars/') return res.end(JSON.stringify({ calendars: [{ id: req.headers.authorization.includes(PIT) ? 'provCal' : 'arkCal', name: 'C' }] }));
    if (url.pathname === '/opportunities/') return res.end(JSON.stringify({ opportunity: { id: 'o1' } }));
    if (url.pathname === '/contacts/upsert') return res.end(JSON.stringify({ contact: { id: 'c1' } }));
    res.statusCode = 404; res.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const env = { SUPABASE_URL: base, SUPABASE_PUBLISHABLE_KEY: 'test-public', GHL_API_KEY: 'ark-default-token', GHL_LOCATION_ID: 'arkLoc', GHL_BASE_URL: base,
    GHL_PIPELINE_ID: 'arkPipe', GHL_PIPELINE_STAGE_ID: '', ...KEY };
  const saved = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  const app = await createApp(); await app.listen(0, '127.0.0.1');
  t.after(async () => {
    await app.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    for (const [key, value] of Object.entries(saved)) value === undefined ? delete process.env[key] : process.env[key] = value;
  });
  const api = `${await app.getUrl()}/api/v1/ghl`;
  const call = async (path, { method = 'GET', body, token } = {}) => {
    const response = await fetch(`${api}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text(); responses.push(text);
    return { status: response.status, json: text ? JSON.parse(text) : null, cache: response.headers.get('cache-control') };
  };

  assert.equal((await call('/account', { method: 'PUT', body: { locationId: 'provLoc', token: PIT } })).status, 401);
  assert.equal((await call('/account', { method: 'PUT', body: { locationId: 'provLoc', token: PIT }, token: 'customer' })).status, 403);
  assert.deepEqual((await call('/account', { method: 'PUT', body: { locationId: 'provLoc', token: 'pit-wrong-token-000000' }, token: 'provider' })).json, { error: 'ghl_invalid_credentials' });
  assert.equal(rows.size, 0);
  const connected = await call('/account', { method: 'PUT', body: { locationId: 'provLoc', token: PIT, pipelineId: 'provPipe' }, token: 'provider' });
  assert.equal(connected.status, 200);
  assert.equal(connected.cache, 'no-store');
  assert.deepEqual(connected.json, { providerId: provider, connected: true, locationId: 'provLoc', pipelineId: 'provPipe', pipelineStageId: null,
    connectedAt: '2027-01-01T00:00:00Z', updatedAt: '2027-01-01T00:00:00Z' });
  assert.ok(!rows.get(provider).token_ciphertext.includes(PIT));
  assert.equal((await call('/account', { token: 'provider' })).json.locationId, 'provLoc');
  const firstCiphertext = rows.get(provider).token_ciphertext;
  const reconnected = await call('/account', { method: 'PUT', body: { locationId: 'provLoc', token: PIT, pipelineId: 'provPipe' }, token: 'provider' });
  assert.deepEqual([reconnected.status, reconnected.json.updatedAt, rows.size], [200, '2027-01-02T00:00:00Z', 1]);
  assert.notEqual(rows.get(provider).token_ciphertext, firstCiphertext);

  assert.equal((await call('/accounts', { token: 'customer' })).status, 403);
  assert.deepEqual((await call('/accounts', { token: 'operator' })).json.items.map(item => item.providerId), [provider]);
  assert.equal((await call(`/accounts/${provider}`, { token: 'operator' })).json.connected, true);
  assert.equal((await call(`/accounts/${other}`, { token: 'operator' })).json.connected, false);
  assert.equal((await call(`/accounts/${provider}`, { token: 'provider' })).status, 403);

  assert.equal((await call(`/calendars?providerId=${provider}`, { token: 'customer' })).json.items[0].id, 'provCal');
  assert.equal((await call('/calendars', { token: 'customer' })).json.items[0].id, 'arkCal');
  assert.equal((await call(`/opportunities?providerId=${provider}`, { method: 'POST', body: { contactId: 'c1', name: 'Yate' }, token: 'provider' })).status, 201);
  assert.deepEqual([ghlCalls.at(-1).authorization, ghlCalls.at(-1).body.locationId, ghlCalls.at(-1).body.pipelineId], [`Bearer ${PIT}`, 'provLoc', 'provPipe']);
  assert.equal((await call(`/opportunities?providerId=${provider}`, { method: 'POST', body: { contactId: 'c1', name: 'Yate' }, token: 'customer' })).status, 403);
  assert.equal((await call('/opportunities', { method: 'POST', body: { contactId: 'c1', name: 'Yate' }, token: 'provider' })).status, 403);
  assert.equal((await call('/opportunities?providerId=nope', { method: 'POST', body: { contactId: 'c1', name: 'Yate' }, token: 'operator' })).status, 400);
  assert.equal((await call('/opportunities', { method: 'POST', body: { contactId: 'c1', name: 'Yate' }, token: 'operator' })).status, 201);
  assert.deepEqual([ghlCalls.at(-1).authorization, ghlCalls.at(-1).body.locationId, ghlCalls.at(-1).body.pipelineId], ['Bearer ark-default-token', 'arkLoc', 'arkPipe']);

  assert.equal((await call('/account', { method: 'DELETE', token: 'provider' })).json.connected, false);
  assert.equal(rows.size, 0);
  assert.equal((await call(`/calendars?providerId=${provider}`, { token: 'customer' })).json.items[0].id, 'arkCal');
  assert.deepEqual((await call(`/contacts?providerId=${provider}`, { method: 'POST', body: { email: 'ana@ark305.com' }, token: 'provider' })).json, { error: 'ghl_account_not_connected' });
  assert.ok(responses.every(text => !text.includes(PIT) && !text.includes('token_ciphertext') && !text.includes('v1.')), 'no response carries the token');
});
