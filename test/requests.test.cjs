const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { createApp } = require('../dist/app');

test('service requests are authenticated and scoped to the verified owner', async (t) => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const otherOwner = '33333333-3333-4333-8333-333333333333';
  const requestId = '22222222-2222-4222-8222-222222222222';
  const otherRequestId = '44444444-4444-4444-8444-444444444444';
  const saved = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY };
  const calls = [];
  let rows = [];
  let storageMode = 'ok';
  const provider = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const requesterId = req.headers.authorization === 'Bearer other-session' ? otherOwner : owner;
    if (req.url === '/auth/v1/user') return res.end(JSON.stringify({ id: requesterId }));
    let body = ''; for await (const chunk of req) body += chunk;
    calls.push({ method: req.method, url: req.url, headers: req.headers, body });
    if (storageMode === 'fail') { res.statusCode = 500; return res.end(JSON.stringify({ secret: 'private-detail' })); }
    if (storageMode === 'malformed-json') return res.end('{');
    if (storageMode === 'malformed-shape') return res.end(JSON.stringify({ unexpected: true }));
    if (storageMode === 'empty-write' && req.method === 'POST') return res.end('[]');
    if (storageMode === 'wrong-owner') {
      const foreignRow = rows.find(row => row.requester_id !== requesterId);
      return res.end(JSON.stringify(foreignRow ? [foreignRow] : []));
    }
    if (req.method === 'POST') {
      const request = JSON.parse(body);
      const row = {
        ...request,
        id: requesterId === owner ? requestId : otherRequestId,
        requester_id: requesterId,
        status: 'received',
        created_at: '2026-10-30T12:00:00Z',
      };
      rows.push(row);
      res.statusCode = 201;
      return res.end(JSON.stringify([row]));
    }
    const query = new URL(req.url, 'http://provider.test').searchParams;
    const visible = rows.filter(row => row.requester_id === requesterId &&
      (!query.has('id') || query.get('id') === `eq.${row.id}`));
    res.end(JSON.stringify(visible));
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  process.env.SUPABASE_URL = `http://127.0.0.1:${provider.address().port}`;
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-public-key';
  const app = await createApp(); await app.listen(0, '127.0.0.1');
  t.after(async () => {
    await app.close(); provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve));
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
  const base = `${await app.getUrl()}/api/v1/service-requests`;
  const headers = { authorization: 'Bearer test-session', 'Content-Type': 'application/json' };
  const valid = { serviceId: 'yacht', requestedDate: '2027-01-15', guests: 4, preferences: 'Sunset' };

  await t.test('all request routes require authentication', async () => {
    for (const [url, method] of [[base, 'GET'], [base, 'POST'], [`${base}/${requestId}`, 'GET']]) {
      assert.equal((await fetch(url, { method })).status, 401);
    }
    assert.equal(calls.length, 0);
  });
  await t.test('invalid and injected fields are rejected before persistence', async () => {
    for (const body of [null, {}, { ...valid, requesterId: owner }, { ...valid, status: 'confirmed' },
      { ...valid, serviceId: 'unknown' }, { ...valid, guests: 0 }, { ...valid, requestedDate: '2027-02-30' },
      { ...valid, preferences: 'a'.repeat(2001) }]) {
      assert.equal((await fetch(base, { method: 'POST', headers, body: JSON.stringify(body) })).status, 400);
    }
    assert.equal(calls.length, 0);
    assert.deepEqual(rows, []);
  });
  await t.test('create forwards the session but not client ownership or confirmation', async () => {
    const response = await fetch(base, { method: 'POST', headers, body: JSON.stringify(valid) });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const result = await response.json();
    assert.equal(result.id, requestId); assert.equal(result.status, 'received');
    assert.equal(result.requesterId, undefined);
    assert.deepEqual(JSON.parse(calls.at(-1).body), { service_id: 'yacht', requested_date: '2027-01-15', guests: 4, preferences: 'Sunset' });
    assert.equal(calls.at(-1).headers.authorization, 'Bearer test-session');
  });
  await t.test('two users create and list only their own rows', async () => {
    const otherHeaders = { ...headers, authorization: 'Bearer other-session' };
    const otherResponse = await fetch(base, { method: 'POST', headers: otherHeaders, body: JSON.stringify(valid) });
    assert.equal(otherResponse.status, 201);
    const otherRequest = await otherResponse.json();
    assert.equal(otherRequest.id, otherRequestId);
    assert.equal(otherRequest.status, 'received');

    const ownList = await fetch(base, { headers });
    assert.equal(ownList.status, 200);
    assert.equal(ownList.headers.get('cache-control'), 'no-store');
    assert.deepEqual((await ownList.json()).items.map(item => item.id), [requestId]);
    const listUrl = new URL(calls.at(-1).url, 'http://provider.test');
    assert.equal(listUrl.searchParams.get('requester_id'), `eq.${owner}`);
    assert.equal(listUrl.searchParams.get('order'), 'created_at.desc,id.desc');
    assert.equal(listUrl.searchParams.get('limit'), '50');
    const otherList = await fetch(base, { headers: otherHeaders });
    assert.deepEqual((await otherList.json()).items.map(item => item.id), [otherRequestId]);
    const otherListUrl = new URL(calls.at(-1).url, 'http://provider.test');
    assert.equal(otherListUrl.searchParams.get('requester_id'), `eq.${otherOwner}`);
    assert.equal((await fetch(`${base}/${requestId}`, { headers })).status, 200);
    assert.equal((await fetch(`${base}/${otherRequestId}`, { headers })).status, 404);
    assert.equal((await fetch(`${base}/${requestId}`, { headers: otherHeaders })).status, 404);
    assert.equal((await fetch(`${base}/not-a-uuid`, { headers })).status, 400);
  });
  await t.test('persistence failures never fabricate success or mutate rows', async () => {
    const before = JSON.stringify(rows);
    for (const mode of ['fail', 'malformed-json', 'malformed-shape', 'wrong-owner', 'empty-write']) {
      storageMode = mode;
      const response = await fetch(base, { method: 'POST', headers, body: JSON.stringify(valid) });
      assert.equal(response.status, 503, mode);
      const text = await response.text();
      assert.equal(text.includes('private-detail'), false);
      assert.equal(text.includes('received'), false);
      assert.equal(JSON.stringify(rows), before, `${mode} changed persisted rows`);
    }
    storageMode = 'wrong-owner';
    assert.equal((await fetch(base, { headers })).status, 503);
    assert.equal((await fetch(`${base}/${requestId}`, { headers })).status, 503);
    assert.equal(JSON.stringify(rows), before);
    storageMode = 'ok';
  });
});
