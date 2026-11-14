import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'node:http';
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IdentityModule } from '../dist/modules/identity/identity.module.js';
import { TrackingModule } from '../dist/modules/tracking/tracking.module.js';
import { TrackingService, parseLocationFix, parseNearbyQuery } from '../dist/modules/tracking/tracking.service.js';

const provider = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const status = fn => error => { assert.equal(error.getStatus(), fn); return true; };

function fakePort({ operator = false, nearby = [], locations = [] } = {}) {
  const calls = [];
  return {
    calls,
    async isOperator(token, userId) { calls.push(['isOperator', token, userId]); return operator; },
    async saveLocation(token, providerId, fix) { calls.push(['saveLocation', token, providerId, fix]); return { ...fix, providerId, recordedAt: '2027-01-01T00:00:00Z' }; },
    async nearby(token, origin, radiusKm) { calls.push(['nearby', token, origin, radiusKm]); return nearby; },
    async listLocations(token) { calls.push(['listLocations', token]); return locations; },
  };
}

test('location parsing accepts on-duty fixes and rejects spoofed owners, timestamps and bad coordinates', () => {
  assert.deepEqual(parseLocationFix({ latitude: 25.76, longitude: -80.19 }), { latitude: 25.76, longitude: -80.19, accuracyM: null, onDuty: true });
  assert.deepEqual(parseLocationFix({ latitude: -90, longitude: 180, accuracy: 8, onDuty: false }), { latitude: -90, longitude: 180, accuracyM: 8, onDuty: false });
  for (const body of [null, [], {}, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: -181 }, { latitude: '25', longitude: 0 },
    { latitude: Number.NaN, longitude: 0 }, { latitude: 0, longitude: 0, accuracy: -1 }, { latitude: 0, longitude: 0, onDuty: 'yes' },
    { latitude: 0, longitude: 0, providerId: other }, { latitude: 0, longitude: 0, recordedAt: '2020-01-01T00:00:00Z' }]) {
    assert.throws(() => parseLocationFix(body), status(400), JSON.stringify(body));
  }
});

test('nearby parsing defaults the radius and bounds it to 50 km', () => {
  assert.deepEqual(parseNearbyQuery({ latitude: '25.7617', longitude: '-80.1918' }), { latitude: 25.7617, longitude: -80.1918, radiusKm: 5 });
  assert.equal(parseNearbyQuery({ latitude: '0', longitude: '0', radiusKm: '50' }).radiusKm, 50);
  for (const query of [{}, { latitude: '25' }, { latitude: '91', longitude: '0' }, { latitude: '0', longitude: '1e2' }, { latitude: '0', longitude: '0', radiusKm: '0' },
    { latitude: '0', longitude: '0', radiusKm: '51' }, { latitude: ['1', '2'], longitude: '0' }, { latitude: '0', longitude: '0', all: 'true' }]) {
    assert.throws(() => parseNearbyQuery(query), status(400), JSON.stringify(query));
  }
});

test('providers can only write their own location', async () => {
  const port = fakePort(); const service = new TrackingService(port);
  const saved = await service.shareLocation('tok', provider, { latitude: 25.76, longitude: -80.19, accuracy: 5 });
  assert.equal(saved.providerId, provider);
  assert.deepEqual(port.calls[0], ['saveLocation', 'tok', provider, { latitude: 25.76, longitude: -80.19, accuracyM: 5, onDuty: true }]);
  await assert.rejects(service.shareLocation('tok', provider, { latitude: 1, longitude: 1, providerId: other }), status(400));
  const mismatched = new TrackingService({ ...fakePort(), async saveLocation(_t, _p, fix) { return { ...fix, providerId: other, recordedAt: '2027-01-01T00:00:00Z' }; } });
  await assert.rejects(mismatched.shareLocation('tok', provider, { latitude: 1, longitude: 1 }), status(503));
});

test('nearby drops stale and out-of-radius rows, sorts by distance and hides coordinates from non-operators', async () => {
  const rows = [
    { providerId: 'c', distanceKm: 2.04, ageSeconds: 30, latitude: 1, longitude: 1 },
    { providerId: 'a', distanceKm: 0.46, ageSeconds: 899, latitude: 2, longitude: 2 },
    { providerId: 'stale', distanceKm: 0.1, ageSeconds: 901, latitude: 3, longitude: 3 },
    { providerId: 'far', distanceKm: 5.2, ageSeconds: 10, latitude: 4, longitude: 4 },
  ];
  const member = await new TrackingService(fakePort({ nearby: rows })).nearby('tok', other, { latitude: '25', longitude: '-80', radiusKm: '5' });
  assert.equal(member.staleAfterMinutes, 15);
  assert.deepEqual(member.items, [{ providerId: 'a', distanceKm: 0.5, ageSeconds: 899 }, { providerId: 'c', distanceKm: 2, ageSeconds: 30 }]);
  const port = fakePort({ operator: true, nearby: rows });
  const operator = await new TrackingService(port).nearby('tok', other, { latitude: '25', longitude: '-80', radiusKm: '5' });
  assert.deepEqual(operator.items.map(item => [item.providerId, item.latitude]), [['a', 2], ['c', 1]]);
  assert.equal(operator.items[0].distanceKm, 0.46);
  assert.deepEqual(port.calls.find(call => call[0] === 'nearby'), ['nearby', 'tok', { latitude: 25, longitude: -80, radiusKm: 5 }, 5]);
  const many = Array.from({ length: 80 }, (_, i) => ({ providerId: `p${String(i).padStart(2, '0')}`, distanceKm: i / 100, ageSeconds: 1, latitude: null, longitude: null }));
  assert.equal((await new TrackingService(fakePort({ nearby: many })).nearby('tok', other, { latitude: '0', longitude: '0' })).items.length, 50);
});

test('only operators list every location, with stale and availability flags', async () => {
  await assert.rejects(new TrackingService(fakePort()).listLocations('tok', other), status(403));
  const base = { latitude: 1, longitude: 1, accuracyM: null };
  const service = new TrackingService(fakePort({ operator: true, locations: [
    { ...base, providerId: 'fresh', onDuty: true, recordedAt: '2027-01-01T00:10:00Z' },
    { ...base, providerId: 'off', onDuty: false, recordedAt: '2027-01-01T00:10:00Z' },
    { ...base, providerId: 'old', onDuty: true, recordedAt: '2027-01-01T00:04:59Z' },
  ] }));
  service.now = () => Date.parse('2027-01-01T00:20:00Z');
  const { items } = await service.listLocations('tok', other);
  assert.deepEqual(items.map(item => [item.providerId, item.stale, item.available]), [['fresh', false, true], ['off', false, false], ['old', true, false]]);
});

test('migration keeps one server-stamped row per provider behind RLS (structural, see tracking-rls.cjs for runtime)', () => {
  const sql = fs.readFileSync(new URL('../supabase/migrations/20261114010000_provider_locations.sql', import.meta.url), 'utf8');
  for (const invariant of [/provider_id uuid primary key references public\.profiles\(id\)/i, /enable row level security/i,
    /revoke all on public\.provider_locations from public, anon, authenticated/i, /new\.recorded_at := now\(\)/i,
    /interval '15 minutes'/i, /p\.kind = 'provider'/i, /request_administrators a where a\.user_id = \(select auth\.uid\(\)\)/i,
    /security definer set search_path = ''/i, /grant execute on function public\.nearby_providers\([^)]*\) to authenticated/i]) assert.match(sql, invariant);
  assert.doesNotMatch(sql, /grant (insert|update) \([^)]*recorded_at/i);
  assert.doesNotMatch(sql, /grant delete|to anon/i);
});

class TrackingTestModule {}
Module({ imports: [IdentityModule, TrackingModule] })(TrackingTestModule);

test('tracking routes require identity, write as the caller and gate the full list to operators', async (t) => {
  const keys = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const calls = [];
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const caller = req.headers.authorization === 'Bearer operator-token' ? other : provider;
    if (req.url === '/auth/v1/user') return res.end(JSON.stringify({ id: req.headers.authorization === 'Bearer bad' ? null : caller }));
    let body = ''; for await (const chunk of req) body += chunk;
    calls.push({ method: req.method, url: req.url, authorization: req.headers.authorization, prefer: req.headers.prefer, body });
    if (req.url.startsWith('/rest/v1/request_administrators?')) return res.end(JSON.stringify(caller === other ? [{ user_id: other }] : []));
    if (req.url.startsWith('/rest/v1/provider_locations?') && req.method === 'POST') {
      if (req.headers.authorization === 'Bearer member-token') { res.statusCode = 403; return res.end('{"code":"42501"}'); }
      const row = JSON.parse(body);
      return res.end(JSON.stringify([{ ...row, recorded_at: '2027-01-01T00:00:00+00:00' }]));
    }
    if (req.url.startsWith('/rest/v1/provider_locations?')) {
      return res.end(JSON.stringify([{ provider_id: provider, latitude: 25.77, longitude: -80.19, accuracy_m: null, on_duty: true, recorded_at: new Date().toISOString() }]));
    }
    if (req.url === '/rest/v1/rpc/nearby_providers') {
      return res.end(JSON.stringify([{ provider_id: provider, distance_km: 0.93, age_seconds: 12, latitude: caller === other ? 25.77 : null, longitude: caller === other ? -80.19 : null }]));
    }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  Object.assign(process.env, { SUPABASE_URL: `http://127.0.0.1:${server.address().port}`, SUPABASE_PUBLISHABLE_KEY: 'test-public' });
  const app = await NestFactory.create(TrackingTestModule, { logger: false });
  app.setGlobalPrefix('api/v1'); await app.listen(0, '127.0.0.1');
  t.after(async () => {
    await app.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    for (const [key, value] of Object.entries(saved)) value === undefined ? delete process.env[key] : process.env[key] = value;
  });
  const base = `${await app.getUrl()}/api/v1/tracking`;
  const json = token => ({ authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
  const post = (token, body) => fetch(`${base}/location`, { method: 'POST', headers: json(token), body: JSON.stringify(body) });

  for (const path of ['/location', '/nearby?latitude=25&longitude=-80', '/locations']) {
    assert.equal((await fetch(`${base}${path}`, { method: path === '/location' ? 'POST' : 'GET' })).status, 401, path);
  }
  const shared = await post('provider-token', { latitude: 25.77, longitude: -80.19, accuracy: 9 });
  assert.equal(shared.status, 200);
  assert.equal((await shared.json()).providerId, provider);
  const write = calls.at(-1);
  assert.equal(write.authorization, 'Bearer provider-token');
  assert.match(write.url, /on_conflict=provider_id/);
  assert.match(write.prefer, /resolution=merge-duplicates/);
  assert.deepEqual(JSON.parse(write.body), { provider_id: provider, latitude: 25.77, longitude: -80.19, accuracy_m: 9, on_duty: true });
  assert.equal((await post('provider-token', { latitude: 25.77, longitude: -80.19, providerId: other })).status, 400);
  assert.equal((await post('member-token', { latitude: 25.77, longitude: -80.19 })).status, 403);

  const memberNearby = await (await fetch(`${base}/nearby?latitude=25.7617&longitude=-80.1918&radiusKm=2`, { headers: json('provider-token') })).json();
  assert.deepEqual(memberNearby.items, [{ providerId: provider, distanceKm: 0.9, ageSeconds: 12 }]);
  assert.deepEqual(JSON.parse(calls.at(-1).body), { origin_latitude: 25.7617, origin_longitude: -80.1918, radius_km: 2 });
  const operatorNearby = await (await fetch(`${base}/nearby?latitude=25.7617&longitude=-80.1918&radiusKm=2`, { headers: json('operator-token') })).json();
  assert.equal(operatorNearby.items[0].latitude, 25.77);
  assert.equal((await fetch(`${base}/nearby?latitude=25.7617&longitude=-80.1918&radiusKm=500`, { headers: json('provider-token') })).status, 400);

  assert.equal((await fetch(`${base}/locations`, { headers: json('provider-token') })).status, 403);
  const listed = await fetch(`${base}/locations`, { headers: json('operator-token') });
  assert.equal(listed.status, 200);
  assert.equal(listed.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await listed.json()).items.map(item => [item.providerId, item.available]), [[provider, true]]);
});
