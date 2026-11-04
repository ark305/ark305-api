import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('API boots and preserves HTTP contracts without require(esm) support', () => {
  const probe = `
    import assert from 'node:assert/strict';
    import { createApp } from './dist/app.js';
    const app = await createApp();
    try {
      await app.listen(0, '127.0.0.1');
      const base = await app.getUrl();
      const health = await fetch(base + '/api/v1/health');
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), { status: 'ok', service: 'ark305-api' });
      assert.equal((await fetch(base + '/health')).status, 404);
      const catalog = await fetch(base + '/api/v1/catalog');
      assert.equal(catalog.status, 200);
      assert.equal((await catalog.json()).items.length, 18);
      assert.equal((await fetch(base + '/api/v1/team-proposals')).status, 401);
      console.log('esm-runtime-ok');
    } finally { await app.close(); }
  `;
  const result = spawnSync(process.execPath,
    ['--no-experimental-require-module', '--input-type=module', '--eval', probe], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: { ...process.env, NODE_OPTIONS: '' },
      encoding: 'utf8', timeout: 15000,
    });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.signal, null);
  assert.match(result.stdout, /esm-runtime-ok/);
});
