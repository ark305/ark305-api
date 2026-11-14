import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'node:http';
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IdentityModule } from '../dist/modules/identity/identity.module.js';
import { ProviderServicesModule } from '../dist/modules/provider-services/provider-services.module.js';
import { ProviderServicesService, parseServiceFields, parseServiceSearch, parseServiceId } from '../dist/modules/provider-services/provider-services.service.js';

const provider = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const serviceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const status = code => error => { assert.equal(error.getStatus(), code); return true; };
const row = (extra = {}) => ({ id: serviceId, providerId: provider, name: 'Yate 50 ft', description: '', priceCents: 150000, currency: 'USD',
  durationMinutes: 240, category: 'water', active: true, createdAt: '2027-01-01T00:00:00Z', updatedAt: '2027-01-01T00:00:00Z', ...extra });

function fakePort(overrides = {}) {
  const calls = [];
  return {
    calls,
    async create(token, providerId, fields) { calls.push(['create', providerId, fields]); return row({ providerId, ...fields }); },
    async update(token, providerId, id, fields) { calls.push(['update', providerId, id, fields]); return row({ id, providerId, ...fields }); },
    async findById(token, id) { calls.push(['findById', id]); return row({ id }); },
    async search(token, search) { calls.push(['search', search]); return [row()]; },
    async listOwn(token, providerId, page) { calls.push(['listOwn', providerId, page]); return [row({ providerId, active: false })]; },
    ...overrides,
  };
}

test('service input is strict: limits, integers, known keys only, never an owner', () => {
  assert.deepEqual(parseServiceFields({ name: '  Yate ', priceCents: 0, durationMinutes: 1, category: 'water' }, false),
    { name: 'Yate', description: '', priceCents: 0, currency: 'USD', durationMinutes: 1, category: 'water', active: true });
  assert.deepEqual(parseServiceFields({ description: 'Línea 1\nLínea 2', currency: 'EUR', active: false }, true),
    { description: 'Línea 1\nLínea 2', currency: 'EUR', active: false });
  const base = { name: 'Yate', priceCents: 100, durationMinutes: 60, category: 'water' };
  for (const body of [null, [], {}, { ...base, providerId: other }, { ...base, provider_id: other }, { ...base, id: serviceId }, { ...base, createdAt: 'x' },
    { ...base, priceCents: -1 }, { ...base, priceCents: 1.5 }, { ...base, priceCents: '100' }, { ...base, priceCents: 100_000_001 },
    { ...base, durationMinutes: 0 }, { ...base, durationMinutes: 43_201 }, { ...base, durationMinutes: Number.NaN },
    { ...base, name: '' }, { ...base, name: '   ' }, { ...base, name: 'x'.repeat(121) }, { ...base, name: 'a\nb' }, { ...base, name: 'a\u0000b' },
    { ...base, description: 'x'.repeat(2001) }, { ...base, description: 7 }, { ...base, currency: 'usd' }, { ...base, currency: 'US' },
    { ...base, category: 'weapons' }, { ...base, active: 'yes' }, { name: 'Yate' }]) {
    assert.throws(() => parseServiceFields(body, false), status(400), JSON.stringify(body));
  }
  assert.throws(() => parseServiceFields({}, true), status(400));
  assert.throws(() => parseServiceFields({ providerId: other }, true), status(400));
  assert.equal(parseServiceFields({ name: 'x'.repeat(120) }, true).name.length, 120);
});

test('search query parsing: text, category, provider and bounded paging', () => {
  assert.deepEqual(parseServiceSearch({}), { limit: 50, offset: 0 });
  assert.deepEqual(parseServiceSearch({ q: ' yate ', category: 'water', providerId: provider.toUpperCase(), limit: '10', offset: '20' }),
    { text: 'yate', category: 'water', providerId: provider, limit: 10, offset: 20 });
  assert.deepEqual(parseServiceSearch({ q: '  ' }), { limit: 50, offset: 0 });
  for (const query of [{ active: 'false' }, { q: ['a', 'b'] }, { q: 'x'.repeat(101) }, { category: 'nope' }, { providerId: 'me' }, { limit: '0' },
    { limit: '101' }, { limit: '1e2' }, { offset: '-1' }, { offset: '10001' }, { limit: '05' }]) {
    assert.throws(() => parseServiceSearch(query), status(400), JSON.stringify(query));
  }
  assert.equal(parseServiceId(serviceId.toUpperCase()), serviceId);
  assert.throws(() => parseServiceId('suv'), status(400));
});

test('a provider creates, updates and deactivates only their own services, owner from the JWT', async () => {
  const port = fakePort(); const service = new ProviderServicesService(port);
  const created = await service.create('tok', provider, { name: 'Yate', priceCents: 100, durationMinutes: 60, category: 'water' });
  assert.equal(created.providerId, provider);
  assert.equal(port.calls[0][1], provider);
  await assert.rejects(service.create('tok', provider, { name: 'Yate', priceCents: 100, durationMinutes: 60, category: 'water', providerId: other }), status(400));
  await service.update('tok', provider, serviceId, { priceCents: 200 });
  assert.deepEqual(port.calls.at(-1), ['update', provider, serviceId, { priceCents: 200 }]);
  assert.equal((await service.deactivate('tok', provider, serviceId)).active, false);
  assert.deepEqual(port.calls.at(-1), ['update', provider, serviceId, { active: false }]);

  const missing = new ProviderServicesService(fakePort({ async update() { return null; } }));
  await assert.rejects(missing.update('tok', provider, serviceId, { priceCents: 1 }), status(404));
  await assert.rejects(missing.deactivate('tok', provider, serviceId), status(404));
  await assert.rejects(missing.update('tok', provider, 'bad', { priceCents: 1 }), status(400));
  const foreign = new ProviderServicesService(fakePort({ async update(_t, _p, id) { return row({ id, providerId: other }); },
    async create() { return row({ providerId: other }); } }));
  await assert.rejects(foreign.update('tok', provider, serviceId, { priceCents: 1 }), status(503));
  await assert.rejects(foreign.create('tok', provider, { name: 'Yate', priceCents: 1, durationMinutes: 1, category: 'water' }), status(503));
});

test('public lists never include inactive services; detail hides inactive ones from everyone but the owner', async () => {
  const port = fakePort({ async search(_t, search) { port.calls.push(['search', search]); return [row(), row({ id: 'x', active: false })]; },
    async findById(_t, id) { return row({ id, active: false }); } });
  const service = new ProviderServicesService(port);
  const result = await service.search('tok', { category: 'water', q: 'yate' });
  assert.deepEqual(result.items.map(item => item.id), [serviceId]);
  assert.deepEqual(port.calls.at(-1), ['search', { text: 'yate', category: 'water', limit: 50, offset: 0 }]);
  assert.equal((await service.findById('tok', provider, serviceId)).active, false);
  await assert.rejects(service.findById('tok', other, serviceId), status(404));
  const none = new ProviderServicesService(fakePort({ async findById() { return null; } }));
  await assert.rejects(none.findById('tok', other, serviceId), status(404));
  const tooMany = new ProviderServicesService(fakePort({ async search() { return [row(), row()]; } }));
  await assert.rejects(tooMany.search('tok', { limit: '1' }), status(503));
  const own = fakePort(); const owner = new ProviderServicesService(own);
  assert.equal((await owner.listOwn('tok', provider, {})).items[0].active, false);
  assert.deepEqual(own.calls.at(-1), ['listOwn', provider, { limit: 50, offset: 0 }]);
  assert.deepEqual((await owner.listOwn('tok', provider, { limit: '100', offset: '200' })), { items: [row({ active: false })], limit: 100, offset: 200 });
  for (const query of [{ q: 'x' }, { category: 'water' }, { limit: '101' }, { offset: '-1' }]) await assert.rejects(owner.listOwn('tok', provider, query), status(400));
  const leaky = new ProviderServicesService(fakePort({ async listOwn() { return [row({ providerId: other })]; } }));
  await assert.rejects(leaky.listOwn('tok', provider, {}), status(503));
  const overfull = new ProviderServicesService(fakePort({ async listOwn() { return [row(), row()]; } }));
  await assert.rejects(overfull.listOwn('tok', provider, { limit: '1' }), status(503));
});

test('migration: owner-only writes, no owner/timestamp/delete grants, active-only public search', () => {
  const sql = fs.readFileSync(new URL('../supabase/migrations/20261114040000_provider_services.sql', import.meta.url), 'utf8');
  for (const invariant of [/enable row level security/i, /revoke all on public\.provider_services from public, anon, authenticated/i,
    /price_cents integer not null check \(price_cents between 0 and 100000000\)/i, /duration_minutes integer not null check \(duration_minutes between 1 and 43200\)/i,
    /security invoker set search_path = ''/i, /where s\.active/i]) assert.match(sql, invariant);
  assert.doesNotMatch(sql.match(/grant update \(([^)]*)\)/i)[1], /provider_id|created_at|updated_at|id,/);
  assert.doesNotMatch(sql.match(/grant insert \(([^)]*)\)/i)[1], /created_at|updated_at|\bid\b/);
  assert.doesNotMatch(sql, /grant delete|to anon\b/i);
});

class ServicesTestModule {}
Module({ imports: [IdentityModule, ProviderServicesModule] })(ServicesTestModule);

test('services routes over HTTP: auth required, owner from JWT, fixed 503 on storage errors', async (t) => {
  const keys = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const users = { 'Bearer provider': provider, 'Bearer customer': other };
  const seen = [];
  let failing = false;
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/auth/v1/user') return res.end(JSON.stringify({ id: users[req.headers.authorization] ?? null }));
    const url = new URL(req.url, 'http://x');
    seen.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body: raw && JSON.parse(raw) });
    if (failing) { res.statusCode = 500; return res.end('{"message":"relation secret_table does not exist","details":"internal"}'); }
    const dbRow = { id: serviceId, provider_id: provider, name: 'Yate', description: '', price_cents: 100, currency: 'USD', duration_minutes: 60,
      category: 'water', active: true, created_at: '2027-01-01T00:00:00Z', updated_at: '2027-01-01T00:00:00Z' };
    if (req.method === 'POST' && url.pathname === '/rest/v1/provider_services') {
      const body = JSON.parse(raw);
      if (body.provider_id !== provider) { res.statusCode = 403; return res.end('{}'); }
      return res.end(JSON.stringify([{ ...dbRow, ...body }]));
    }
    if (req.method === 'PATCH') return res.end(JSON.stringify(url.searchParams.get('provider_id') === `eq.${provider}` ? [{ ...dbRow, ...JSON.parse(raw) }] : []));
    if (url.pathname === '/rest/v1/rpc/search_provider_services') return res.end(JSON.stringify([dbRow]));
    return res.end(JSON.stringify([dbRow]));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  Object.assign(process.env, { SUPABASE_URL: `http://127.0.0.1:${server.address().port}`, SUPABASE_PUBLISHABLE_KEY: 'test-public' });
  const app = await NestFactory.create(ServicesTestModule, { logger: false });
  app.setGlobalPrefix('api/v1'); await app.listen(0, '127.0.0.1');
  t.after(async () => {
    await app.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    for (const [key, value] of Object.entries(saved)) value === undefined ? delete process.env[key] : process.env[key] = value;
  });
  const base = `${await app.getUrl()}/api/v1/services`;
  const call = async (path, { method = 'GET', body, token } = {}) => {
    const response = await fetch(`${base}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, json: await response.json(), cache: response.headers.get('cache-control') };
  };
  const create = { name: 'Yate', priceCents: 100, durationMinutes: 60, category: 'water' };

  for (const [path, method] of [['', 'GET'], ['', 'POST'], [`/${serviceId}`, 'GET'], [`/${serviceId}`, 'PATCH'], [`/${serviceId}/deactivate`, 'POST'], ['/mine', 'GET']]) {
    assert.equal((await call(path, { method, body: method === 'GET' ? undefined : create })).status, 401, `${method} ${path}`);
  }
  assert.equal(seen.length, 0);

  const created = await call('', { method: 'POST', body: create, token: 'provider' });
  assert.equal(created.status, 201);
  assert.equal(created.cache, 'no-store');
  assert.deepEqual(seen.at(-1).body, { provider_id: provider, name: 'Yate', description: '', price_cents: 100, currency: 'USD', duration_minutes: 60, category: 'water', active: true });
  assert.equal((await call('', { method: 'POST', body: create, token: 'customer' })).status, 403);
  assert.equal((await call('', { method: 'POST', body: { ...create, providerId: provider }, token: 'customer' })).status, 400);

  assert.equal((await call(`/${serviceId}`, { method: 'PATCH', body: { priceCents: 250 }, token: 'provider' })).json.priceCents, 250);
  assert.deepEqual([seen.at(-1).query.id, seen.at(-1).query.provider_id], [`eq.${serviceId}`, `eq.${provider}`]);
  assert.equal((await call(`/${serviceId}`, { method: 'PATCH', body: { priceCents: 250 }, token: 'customer' })).status, 404);
  assert.equal(seen.at(-1).query.provider_id, `eq.${other}`);
  const deactivated = await call(`/${serviceId}/deactivate`, { method: 'POST', token: 'provider' });
  assert.deepEqual([deactivated.status, deactivated.json.active, seen.at(-1).body], [200, false, { active: false }]);

  const listed = await call(`?q=yate&category=water&providerId=${provider}&limit=5`, { token: 'customer' });
  assert.deepEqual([listed.status, listed.json.items.length, listed.json.limit], [200, 1, 5]);
  assert.deepEqual(seen.at(-1).body, { search_text: 'yate', search_category: 'water', search_provider: provider, result_limit: 5, result_offset: 0 });
  assert.equal((await call('?active=false', { token: 'customer' })).status, 400);
  assert.equal((await call(`/${serviceId}`, { token: 'customer' })).json.id, serviceId);
  assert.equal((await call('/not-a-uuid', { token: 'customer' })).status, 400);
  assert.equal((await call('/mine?limit=10&offset=20', { token: 'provider' })).json.items[0].providerId, provider);
  assert.deepEqual([seen.at(-1).query.provider_id, seen.at(-1).query.limit, seen.at(-1).query.offset], [`eq.${provider}`, '10', '20']);

  failing = true;
  for (const [path, method, body] of [['', 'GET'], [`/${serviceId}`, 'GET'], ['', 'POST', create], [`/${serviceId}`, 'PATCH', { active: true }]]) {
    const response = await call(path, { method, body, token: 'provider' });
    assert.equal(response.status, 503, `${method} ${path}`);
    assert.deepEqual(response.json.message, 'Catalog storage unavailable');
    assert.doesNotMatch(JSON.stringify(response.json), /secret_table|internal/);
  }
});
