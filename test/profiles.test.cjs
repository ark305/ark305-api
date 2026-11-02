const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
require('reflect-metadata');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { IdentityModule } = require('../dist/modules/identity/identity.module');
const { ProfilesModule } = require('../dist/modules/profiles/profiles.module');

class ProfilesTestModule {}
Module({ imports: [IdentityModule, ProfilesModule] })(ProfilesTestModule);

test('profiles module preserves private writes and explicit public reads over HTTP', async (t) => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const saved = Object.fromEntries(['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'].map((key) => [key, process.env[key]]));
  const calls = [];
  const rows = new Map();
  const services = [];
  const provider = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/auth/v1/user') {
      const id = req.headers.authorization === 'Bearer other-token' ? other : owner;
      return res.end(JSON.stringify({ id }));
    }
    let body = ''; for await (const chunk of req) body += chunk;
    const url = new URL(req.url, 'http://provider.test');
    calls.push({ method: req.method, url: req.url, authorization: req.headers.authorization, body });
    const table = url.pathname.split('/').at(-1);
    const id = req.headers.authorization === 'Bearer other-token' ? other : owner;
    if (table === 'profiles') {
      const handle = url.searchParams.get('handle');
      const selected = [...rows.values()].filter((row) => (!handle || row.handle === handle.slice(3)) &&
        (!url.searchParams.has('id') || row.id === url.searchParams.get('id').slice(3)));
      if (req.method === 'POST') {
        const data = JSON.parse(body); const row = { ...data, id: data.id || id, created_at: '2026-01-01T00:00:00Z' };
        rows.set(row.id, row); res.statusCode = 201; return res.end(JSON.stringify([row]));
      }
      if (req.method === 'PATCH') {
        const row = rows.get(id); if (row) Object.assign(row, JSON.parse(body));
        return res.end(JSON.stringify(row ? [row] : []));
      }
      return res.end(JSON.stringify(selected));
    }
    if (table === 'services') {
      if (req.method === 'POST') {
        const row = { ...JSON.parse(body), id: 'service-1', owner: id };
        services.push(row); res.statusCode = 201; return res.end(JSON.stringify([row]));
      }
      if (req.method === 'PATCH') {
        const row = services.find((service) => service.id === url.searchParams.get('id').slice(3) && service.owner === id);
        if (row) Object.assign(row, JSON.parse(body));
        return res.end(JSON.stringify(row ? [row] : []));
      }
      if (req.method === 'DELETE') {
        const index = services.findIndex((service) => service.id === url.searchParams.get('id').slice(3) && service.owner === id);
        if (index >= 0) services.splice(index, 1);
        return res.end(JSON.stringify([]));
      }
      const ownerFilter = url.searchParams.get('owner')?.slice(3);
      return res.end(JSON.stringify(services.filter((service) => !ownerFilter || service.owner === ownerFilter)));
    }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  process.env.SUPABASE_URL = `http://127.0.0.1:${provider.address().port}`;
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-public-key';
  const app = await NestFactory.create(ProfilesTestModule, { logger: false });
  app.setGlobalPrefix('api/v1'); await app.listen(0, '127.0.0.1');
  t.after(async () => {
    await app.close(); provider.closeAllConnections(); await new Promise((resolve) => provider.close(resolve));
    for (const [key, value] of Object.entries(saved)) value === undefined ? delete process.env[key] : process.env[key] = value;
  });
  const base = `${await app.getUrl()}/api/v1/profiles`;
  const headers = { authorization: 'Bearer own-token', 'Content-Type': 'application/json' };
  const profile = { name: 'Ada', handle: 'ada', kind: 'creator', role: 'Photographer', area: 'Miami', tagline: 'Portraits', photo_url: null, banner_url: null, gallery: [], instagram: null, tiktok: null, facebook: null };

  await t.test('private routes require verified identity and use the caller token', async () => {
    assert.equal((await fetch(`${base}/me`)).status, 401);
    assert.equal((await fetch(`${base}/me`, { headers })).status, 200);
    assert.equal(calls.at(-1).authorization, 'Bearer own-token');
  });
  await t.test('create/update profile and handle checks retain validation and own-row scope', async () => {
    const { handle, name, kind, role, area, photo_url } = profile;
    const created = await fetch(`${base}/me`, { method: 'POST', headers, body: JSON.stringify({ handle, name, kind, role, area, photo_url }) });
    assert.equal(created.status, 201);
    rows.get(owner).taste = { food: 3 }; rows.get(owner).diagnosis = { answers: { who: 'individual' }, at: '2026-01-01' };
    assert.equal((await fetch(`${base}/check-handle?handle=Ada`, { headers })).status, 200);
    assert.equal((await (await fetch(`${base}/check-handle?handle=Ada`, { headers })).json()).status, 'available');
    const otherHeaders = { ...headers, authorization: 'Bearer other-token' };
    const otherProfile = await fetch(`${base}/me`, { method: 'POST', headers: otherHeaders, body: JSON.stringify({ handle: 'other', name: 'Other', kind: 'member', role: '', area: '', photo_url: null }) });
    assert.equal(otherProfile.status, 201);
    assert.equal((await (await fetch(`${base}/check-handle?handle=Ada`, { headers: otherHeaders })).json()).status, 'taken');
    assert.equal((await (await fetch(`${base}/me`, { headers })).json()).row.taste.food, 3);
    const ownPhoto = `${process.env.SUPABASE_URL}/storage/v1/object/public/media/${owner}/gallery.jpg`;
    const normalized = { ...profile, name: 'Ada Lovelace', role: 'R'.repeat(90), area: 'A'.repeat(90), tagline: 'T'.repeat(100),
      gallery: ['', 'https://foreign.test/photo.jpg', ...Array.from({ length: 14 }, (_, index) => `${ownPhoto}?n=${index}`)], instagram: 'i'.repeat(250) };
    assert.equal((await fetch(`${base}/me`, { method: 'PATCH', headers, body: JSON.stringify(normalized) })).status, 200);
    const profileWrite = calls.find((call) => call.method === 'PATCH' && call.url.startsWith('/rest/v1/profiles'));
    assert.equal(profileWrite.url.includes(`id=eq.${owner}`), true);
    const normalizedWrite = JSON.parse(profileWrite.body);
    assert.equal(normalizedWrite.role.length, 60); assert.equal(normalizedWrite.area.length, 60); assert.equal(normalizedWrite.tagline.length, 80);
    assert.equal(normalizedWrite.gallery.length, 12); assert.ok(normalizedWrite.gallery.every((url) => url.startsWith(ownPhoto)));
    assert.equal(normalizedWrite.instagram.length, 200);
    for (const invalid of [{ ...profile, handle: 'x' }, { ...profile, id: other }, { ...profile, name: '' }]) {
      const response = await fetch(`${base}/me`, { method: 'PATCH', headers, body: JSON.stringify(invalid) });
      assert.equal(response.status, 400);
      if (invalid.handle === 'x') assert.equal((await response.json()).code, 'handle');
      if (invalid.name === '') assert.equal((await response.json()).code, 'name');
    }
  });
  await t.test('service writes, step allowlist, taste, side, diagnosis binding and clearing are scoped', async () => {
    assert.equal((await fetch(`${base}/me/services`, { method: 'POST', headers, body: JSON.stringify({ title: 'Boat', price: 10, action: 'book', photo_url: null }) })).status, 201);
    assert.equal(JSON.parse(calls.at(-1).body).owner, owner);
    assert.equal((await fetch(`${base}/me/services/service-1`, { method: 'PATCH', headers, body: JSON.stringify({ title: 'Sunset boat', price: 20, action: 'book', kicker: '', detail: '', photo_url: null }) })).status, 200);
    assert.match(calls.at(-1).url, new RegExp(`owner=eq\\.${owner}`));
    const otherHeaders = { ...headers, authorization: 'Bearer other-token' };
    assert.equal((await fetch(`${base}/me/services/service-1`, { method: 'PATCH', headers: otherHeaders, body: JSON.stringify({ title: 'Hijack', price: 1, action: 'book', kicker: '', detail: '', photo_url: null }) })).status, 400);
    assert.match(calls.at(-1).url, /owner=eq\.22222222-2222-4222-8222-222222222222/);
    assert.equal((await fetch(`${base}/me/services/service-1`, { method: 'DELETE', headers })).status, 200);
    assert.match(calls.at(-1).url, new RegExp(`owner=eq\\.${owner}`));
    assert.equal((await fetch(`${base}/me/steps/admin`, { method: 'PATCH', headers })).status, 400);
    const invalidTitle = await fetch(`${base}/me/services`, { method: 'POST', headers, body: JSON.stringify({ title: '', price: 1, photo_url: null }) });
    assert.equal((await invalidTitle.json()).code, 'title');
    const invalidPrice = await fetch(`${base}/me/services`, { method: 'POST', headers, body: JSON.stringify({ title: 'Boat', price: -1, photo_url: null }) });
    assert.equal((await invalidPrice.json()).code, 'price');
    assert.equal((await fetch(`${base}/me/steps/shared`, { method: 'PATCH', headers })).status, 200);
    assert.equal((await fetch(`${base}/me/taste`, { method: 'PATCH', headers, body: JSON.stringify({ taste: { food: 500, invalid_key: 9 } }) })).status, 200);
    assert.deepEqual(JSON.parse(calls.at(-1).body), { taste: { food: 200 } });
    assert.equal((await fetch(`${base}/me/side`, { method: 'PATCH', headers, body: JSON.stringify({ side: 'business' }) })).status, 200);
    const diagnosis = { answers: { who: 'individual' }, applySide: true, expectedUserId: owner };
    assert.equal((await fetch(`${base}/me/diagnosis`, { method: 'PUT', headers, body: JSON.stringify(diagnosis) })).status, 200);
    assert.equal((await fetch(`${base}/me/diagnosis`, { method: 'PUT', headers, body: JSON.stringify({ ...diagnosis, expectedUserId: other }) })).status, 403);
    assert.equal((await fetch(`${base}/me/diagnosis`, { method: 'DELETE', headers })).status, 200);
    assert.deepEqual(JSON.parse(calls.at(-1).body), { diagnosis: null, taste: {} });
  });
  await t.test('public profile and recent responses omit taste and diagnosis', async () => {
    const response = await fetch(`${base}/handle/ada`);
    assert.equal(response.status, 200);
    const item = (await response.json()).profile;
    assert.equal(item.id, undefined); assert.equal(item.taste, undefined); assert.equal(item.diagnosis, undefined);
    assert.equal(item.handle, 'ada');
    const recent = await fetch(`${base}/recent`);
    assert.equal(recent.status, 200);
    assert.equal((await recent.json()).items[0].diagnosis, undefined);
  });
});
