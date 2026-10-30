const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../dist/app');

test('API exposes versioned health without external services', async (t) => {
  const app = await createApp();
  await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  const base = await app.getUrl();

  await t.test('catalog lists demo services without provider promises', async () => {
    const response = await fetch(`${base}/api/v1/catalog`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/json/);
    const { items } = await response.json();
    assert.equal(items.length, 18);
    assert.equal(new Set(items.map((item) => item.id)).size, 18);
    for (const item of items) {
      assert.equal(item.source, 'demo');
      assert.equal(item.bookable, false);
      assert.deepEqual(item.pricing, { type: 'quote' });
      assert.equal('provider' in item, false);
      assert.ok(item.name.es && item.name.en && item.description.es && item.description.en);
      assert.ok(item.category);
      const detail = await fetch(`${base}/api/v1/catalog/${item.id}`);
      assert.equal(detail.status, 200);
      assert.deepEqual(await detail.json(), item);
    }
  });

  await t.test('catalog rejects malformed IDs and returns 404 for missing services', async () => {
    for (const [id, status] of [['bad%20id', 400], ['a'.repeat(65), 400], ['missing', 404]]) {
      const response = await fetch(`${base}/api/v1/catalog/${id}`);
      assert.equal(response.status, status);
      assert.equal((await response.json()).statusCode, status);
    }
  });

  await t.test('catalog does not allow writes', async () => {
    const before = await (await fetch(`${base}/api/v1/catalog`)).text();
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      for (const suffix of ['', '/suv']) {
        const response = await fetch(`${base}/api/v1/catalog${suffix}`, { method });
        assert.equal(response.status, 404);
      }
    }
    assert.equal(await (await fetch(`${base}/api/v1/catalog`)).text(), before);
  });

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
