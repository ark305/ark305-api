import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../dist/application.js';

test('explicit complements preserve the request and rehydrate idempotently', async t => {
  const owner = '11111111-1111-4111-8111-111111111111', id = '22222222-2222-4222-8222-222222222222';
  const parent = { id, requester_id: owner, service_id: 'yacht', requested_date: '2027-01-15', guests: 4, preferences: '', status: 'received', created_at: '2026-11-01T12:00:00Z' };
  const rows = []; let writes = 0, fail = false;
  const saved = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY };
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const foreign = req.headers.authorization === 'Bearer foreign';
    if (req.url === '/auth/v1/user') return res.end(JSON.stringify({ id: foreign ? '33333333-3333-4333-8333-333333333333' : owner }));
    const url = new URL(req.url, 'http://fixture');
    if (url.pathname === '/rest/v1/service_requests') return res.end(JSON.stringify(foreign ? [] : [parent]));
    if (fail) { res.statusCode = 500; return res.end('{}'); }
    if (req.method === 'POST') {
      writes++; let raw = ''; for await (const part of req) raw += part;
      const body = JSON.parse(raw);
      assert.deepEqual(Object.keys(body).sort(), ['request_id', 'service_id']);
      if (!rows.some(row => row.service_id === body.service_id)) rows.push({ ...body, id: '44444444-4444-4444-8444-444444444444', qty: 1, accepted_at: '2026-11-04T12:00:00Z' });
      return res.end('[]');
    }
    res.end(JSON.stringify(rows));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.SUPABASE_PUBLISHABLE_KEY = 'public-test-key';
  const app = await createApp(); await app.listen(0, '127.0.0.1');
  t.after(async () => { await app.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const url = `${await app.getUrl()}/api/v1/service-requests/${id}/addons`;
  const headers = { authorization: 'Bearer owner', 'Content-Type': 'application/json' };
  const post = (body, h = headers) => fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body) });
  assert.equal((await fetch(url)).status, 401);
  for (const body of [{}, { serviceId: 'chef' }, { serviceId: 'chef', accepted: false }, { serviceId: 'unknown', accepted: true }, { serviceId: 'villa', accepted: true }, { serviceId: 'chef', accepted: true, price: 1 }]) assert.equal((await post(body)).status, 400);
  assert.equal((await post({ serviceId: 'chef', accepted: true }, { ...headers, authorization: 'Bearer foreign' })).status, 404);
  assert.equal(writes, 0);
  for (const status of ['closed', 'cancelled']) { parent.status = status; assert.equal((await post({ serviceId: 'chef', accepted: true })).status, 409); }
  assert.equal(writes, 0); parent.status = 'received';
  const before = JSON.stringify(parent);
  for (let i = 0; i < 2; i++) { const response = await post({ serviceId: 'chef', accepted: true }); assert.equal(response.status, 201); assert.equal((await response.json()).serviceId, 'chef'); }
  assert.equal(rows.length, 1); assert.equal(JSON.stringify(parent), before);
  const reloaded = await (await fetch(url, { headers })).json(); assert.equal(reloaded.items.length, 1); assert.equal(reloaded.items[0].estimate.amount, 500);
  fail = true; assert.equal((await post({ serviceId: 'bottles', accepted: true })).status, 503); assert.equal(rows.length, 1);
});
