const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { createApp } = require('../dist/app');

test('administrative requests require verified membership and expected-state writes', async t => {
  const admin = '55555555-5555-4555-8555-555555555555';
  const owner = '11111111-1111-4111-8111-111111111111';
  const id = 'a2222222-2222-4222-8222-22222222222b';
  let row = { id, requester_id: owner, service_id: 'yacht', requested_date: '2027-01-15', guests: 4, preferences: '', status: 'received', created_at: '2026-11-01T12:00:00Z' };
  let enabled = true; let mode = 'ok'; const writes = []; const reads = [];
  const saved = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY };
  const provider = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const isAdmin = req.headers.authorization === 'Bearer admin-session';
    const url = new URL(req.url, 'http://test');
    if (url.pathname === '/auth/v1/user') return res.end(JSON.stringify({ id: isAdmin ? admin : owner, user_metadata: { role: 'admin' } }));
    if (url.pathname === '/rest/v1/request_administrators') {
      if (mode === 'membership-failure') { res.statusCode = 500; return res.end('{"secret":"private error"}'); }
      if (mode === 'foreign-membership') return res.end(JSON.stringify([{ user_id: owner }]));
      return res.end(JSON.stringify(isAdmin && enabled ? [{ user_id: admin }] : []));
    }
    if (url.pathname === '/rest/v1/service_requests') {
      if (req.method === 'PATCH') {
        let body = ''; for await (const part of req) body += part;
        const input = JSON.parse(body); writes.push({ input, url, bearer: req.headers.authorization });
        if (mode === 'write-failure') { res.statusCode = 500; return res.end('{"secret":"private error"}'); }
        if (url.searchParams.get('id')?.toLowerCase() !== `eq.${id}` || url.searchParams.get('status') !== `eq.${row.status}`) return res.end('[]');
        row = { ...row, ...input };
        return res.end(JSON.stringify([row]));
      }
      reads.push(url);
      if (mode === 'malformed') return res.end(JSON.stringify([{ ...row, requester_id: 'invalid' }]));
      return res.end(JSON.stringify([row]));
    }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  process.env.SUPABASE_URL = `http://127.0.0.1:${provider.address().port}`;
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-public-key';
  const app = await createApp(); await app.listen(0, '127.0.0.1');
  t.after(async () => {
    await app.close(); provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve));
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
  const base = `${await app.getUrl()}/api/v1/admin/service-requests`;
  const headers = { authorization: 'Bearer admin-session', 'content-type': 'application/json' };
  const patch = (body, auth = headers, requestId = id) => fetch(`${base}/${requestId}`, { method: 'PATCH', headers: auth, body: JSON.stringify(body) });
  const change = { expectedStatus: 'received', status: 'in_progress' };
  await t.test('anonymous and self-declared administrators cannot read or write', async () => {
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await fetch(base, { headers: { authorization: 'Bearer client-session' } })).status, 403);
    assert.equal((await patch(change, { ...headers, authorization: 'Bearer client-session' })).status, 403);
    assert.equal(reads.length, 0); assert.equal(writes.length, 0);
  });
  await t.test('administrator lists sanitized inbox and changes only status', async () => {
    const result = await fetch(base, { headers }); assert.equal(result.status, 200);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    const item = (await result.json()).items[0];
    assert.equal(item.requesterId, owner); assert.equal(item.status, 'received');
    assert.equal('requester_id' in item, false);
    assert.equal(reads.at(-1).searchParams.get('limit'), '50');
    const updated = await patch(change); assert.equal(updated.status, 200);
    assert.equal((await updated.json()).status, 'in_progress');
    assert.deepEqual(writes[0].input, { status: 'in_progress' });
    assert.equal(writes[0].bearer, 'Bearer admin-session');
    assert.equal(writes[0].url.searchParams.get('status'), 'eq.received');
    assert.equal((await patch(change)).status, 409);
  });
  await t.test('invalid transitions and injected fields do not write', async () => {
    const before = writes.length;
    for (const body of [ { expectedStatus: 'received', status: 'closed' }, { ...change, requesterId: admin }, { expectedStatus: 'closed', status: 'received' }, { expectedStatus: 'received', status: 'paid' } ]) {
      assert.equal((await patch(body)).status, 400);
    }
    assert.equal((await patch(change, headers, 'not-a-uuid')).status, 400);
    assert.equal(writes.length, before);
  });
  await t.test('uppercase request UUID returns canonical success after exactly one write', async () => {
    const count = writes.length;
    const response = await patch({ expectedStatus: 'in_progress', status: 'closed' }, headers, id.toUpperCase());
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.id, id); assert.equal(body.status, 'closed');
    assert.equal(row.status, 'closed'); assert.equal(writes.length, count + 1);
  });
  await t.test('membership revocation and provider failures fail closed without leaking details', async () => {
    enabled = false;
    assert.equal((await fetch(base, { headers })).status, 403);
    enabled = true;
    for (mode of ['membership-failure', 'foreign-membership', 'malformed']) {
      const response = await fetch(base, { headers });
      assert.equal(response.status, 503, mode); assert.doesNotMatch(await response.text(), /private error/);
    }
    mode = 'write-failure'; const before = JSON.stringify(row); const count = writes.length;
    const response = await patch({ expectedStatus: 'in_progress', status: 'closed' });
    assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private error/);
    assert.equal(JSON.stringify(row), before); assert.equal(writes.length, count + 1, 'failed writes must not retry');
  });
});
