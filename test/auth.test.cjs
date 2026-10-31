const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { createApp } = require('../dist/app');

test('Nest validates identity without trusting client claims', async (t) => {
  const original = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_PUBLISHABLE_KEY };
  const userId = '11111111-1111-4111-8111-111111111111';
  let status = 200;
  let payload = { id: userId, email: 'private@example.test', user_metadata: { role: 'admin' } };
  const requests = [];
  const provider = createServer((req, res) => {
    requests.push({ url: req.url, headers: req.headers });
    res.writeHead(status, { 'Content-Type': 'application/json', Location: '/redirected' });
    res.end(JSON.stringify(payload));
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  process.env.SUPABASE_URL = `http://127.0.0.1:${provider.address().port}`;
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
  const app = await createApp();
  await app.listen(0, '127.0.0.1');
  t.after(async () => {
    await app.close();
    provider.closeAllConnections();
    await new Promise(resolve => provider.close(resolve));
    for (const [key, value] of [['SUPABASE_URL', original.url], ['SUPABASE_PUBLISHABLE_KEY', original.key]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const base = await app.getUrl();
  const me = (authorization) => fetch(`${base}/api/v1/me?userId=attacker`, {
    headers: authorization ? { authorization } : {},
  });

  await t.test('missing or malformed bearer is rejected without calling the provider', async () => {
    for (const header of [undefined, 'Basic token', 'Bearer a b', 'Bearer a,b']) {
      const response = await me(header);
      assert.equal(response.status, 401);
      assert.equal((await response.json()).statusCode, 401);
    }
    assert.equal(requests.length, 0);
  });

  await t.test('verified identity is minimal, private and independent of request claims', async () => {
    const response = await me('Bearer valid-token');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { user: { id: userId } });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(requests.at(-1).url, '/auth/v1/user');
    assert.equal(requests.at(-1).headers.authorization, 'Bearer valid-token');
    assert.equal(requests.at(-1).headers.apikey, 'test-publishable-key');
  });

  await t.test('invalid tokens fail closed and provider errors are sanitized', async () => {
    for (const [upstream, expected] of [[401, 401], [403, 401], [429, 503], [500, 503], [302, 503]]) {
      status = upstream;
      payload = { message: 'private-upstream-details' };
      const before = requests.length;
      const response = await me('Bearer invalid-token');
      assert.equal(response.status, expected);
      assert.equal((await response.text()).includes('private-upstream-details'), false);
      assert.equal(requests.length, before + 1);
    }
    status = 200;
    for (const invalid of [{}, { id: 'not-a-user-id' }, null]) {
      payload = invalid;
      assert.equal((await me('Bearer invalid-token')).status, 503);
    }
  });

  await t.test('missing configuration blocks private routes but preserves public routes', async () => {
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    assert.equal((await me('Bearer valid-token')).status, 503);
    for (const endpoint of ['health', 'catalog', 'catalog/suv']) {
      assert.equal((await fetch(`${base}/api/v1/${endpoint}`)).status, 200);
    }
  });

  await t.test('invalid origins never receive the session token', async () => {
    process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
    const before = requests.length;
    for (const origin of ['http://example.test', 'https://user:password@example.test',
      'https://example.test/path', 'https://example.test?query=1', 'https://example.test#fragment']) {
      process.env.SUPABASE_URL = origin;
      assert.equal((await me('Bearer valid-token')).status, 503);
    }
    assert.equal(requests.length, before);
  });
});
