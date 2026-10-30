const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../dist/app');

test('API exposes versioned health without external services', async (t) => {
  const app = await createApp();
  await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  const base = await app.getUrl();

  await t.test('GET health returns the public contract', async () => {
    const response = await fetch(`${base}/api/v1/health`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.deepEqual(await response.json(), { status: 'ok', service: 'ark305-api' });
  });

  await t.test('unknown routes remain unavailable', async () => {
    const response = await fetch(`${base}/api/v1/providers`);
    assert.equal(response.status, 404);
    assert.equal((await response.json()).statusCode, 404);
  });

  await t.test('health is not exposed outside the versioned API', async () => {
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 404);
  });
});
