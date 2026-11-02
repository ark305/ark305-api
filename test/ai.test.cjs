const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { createApp } = require('../dist/app');

test('Nest conversation preserves identity, quota and the generic AI contract', async (t) => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const keys = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'META_API_KEY', 'META_BASE_URL', 'META_MODEL', 'META_MODEL_QUICK'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const calls = [];
  let allowed = true;
  let metaStatus = 200;
  const provider = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    let raw = ''; for await (const chunk of req) raw += chunk;
    calls.push({ path: req.url, authorization: req.headers.authorization, body: raw && JSON.parse(raw) });
    if (req.url === '/auth/v1/user') return res.end(JSON.stringify({ id: owner }));
    if (req.url === '/rest/v1/rpc/bump_ai') return res.end(JSON.stringify(allowed));
    if (req.url.startsWith('/rest/v1/profiles?')) return res.end(JSON.stringify([{ experience: 'business' }]));
    if (req.url === '/v1/messages') {
      res.statusCode = metaStatus;
      return res.end(JSON.stringify(metaStatus === 200 ? { content: [{ type: 'thinking', thinking: 'private' }, { type: 'text', text: 'Hello' }] } : { secret: 'private upstream detail' }));
    }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  const providerUrl = `http://127.0.0.1:${provider.address().port}`;
  Object.assign(process.env, { SUPABASE_URL: providerUrl, SUPABASE_PUBLISHABLE_KEY: 'test-public', META_API_KEY: 'test-meta', META_BASE_URL: providerUrl, META_MODEL: 'test-default', META_MODEL_QUICK: 'test-quick' });
  const app = await createApp(); await app.listen(0, '127.0.0.1');
  t.after(async () => {
    await app.close(); provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve));
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
  const url = `${await app.getUrl()}/api/v1/ai`;
  const send = (body, token = 'test-session') => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

  await t.test('anonymous requests never call upstream providers', async () => {
    assert.equal((await send({ prompt: 'Hello' }, null)).status, 401);
    assert.equal(calls.length, 0);
  });
  await t.test('returns text and verified user with separated credentials', async () => {
    const response = await send({ prompt: 'Hello', locale: 'en', tier: 'quick', json: true });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { text: 'Hello', user: owner });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const meta = calls.find(call => call.path === '/v1/messages');
    assert.equal(meta.authorization, 'Bearer test-meta');
    assert.equal(meta.body.model, 'test-quick');
    assert.match(meta.body.system, /business mode/);
    assert.match(meta.body.system, /ONLY with valid JSON/);
    assert.equal(calls.find(call => call.path === '/rest/v1/rpc/bump_ai').authorization, 'Bearer test-session');
  });
  await t.test('quota refusal prevents Meta consumption', async () => {
    allowed = false; const count = calls.filter(call => call.path === '/v1/messages').length;
    const response = await send({ prompt: 'Hello' });
    assert.equal(response.status, 429); assert.deepEqual(await response.json(), { error: 'rate_limited' });
    assert.equal(calls.filter(call => call.path === '/v1/messages').length, count); allowed = true;
  });
  await t.test('upstream failure does not leak provider details', async () => {
    metaStatus = 500; const response = await send({ prompt: 'Hello' });
    assert.equal(response.status, 502); assert.deepEqual(await response.json(), { error: 'upstream' }); metaStatus = 200;
  });
});
