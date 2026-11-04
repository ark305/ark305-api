import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('Vercel NestJS discovery selects the executable main entry and serves health', { timeout: 20000 }, async (t) => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  // Mirrors the names and framework-import requirement in @vercel/nestjs/src/build.ts.
  const names = ['src/main', 'src/app', 'src/index', 'src/server', 'main', 'app', 'index', 'server'];
  const extensions = ['js', 'cjs', 'mjs', 'ts', 'cts', 'mts'];
  const frameworkImport = /(?:from|require|import)\s*(?:\(\s*)?["']@nestjs\/core["']\s*(?:\))?/;
  const entry = names.flatMap(name => extensions.map(ext => `${name}.${ext}`)).find(path => {
    const url = new URL(`../${path}`, import.meta.url);
    return existsSync(url) && frameworkImport.test(readFileSync(url, 'utf8'));
  });
  assert.equal(entry, 'src/main.ts');
  assert.equal(existsSync(new URL('../src/app.ts', import.meta.url)), false);

  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  const child = spawn(process.execPath, ['--no-experimental-require-module', 'dist/main.js'], {
    cwd: root,
    env: { ...process.env, NODE_OPTIONS: '', HOST: '127.0.0.1', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const closed = once(child, 'close');
  t.after(async () => { if (child.exitCode === null) child.kill(); await closed; });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  await new Promise((resolve, reject) => {
    let stdout = '';
    const timeout = setTimeout(() => reject(new Error('Entrypoint did not start within 10 seconds')), 10000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Entrypoint exited ${code}: ${stderr}`)); });
    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
      if (stdout.includes(`http://127.0.0.1:${port}/api/v1`)) { clearTimeout(timeout); resolve(); }
    });
  });
  const base = `http://127.0.0.1:${port}`;
  const health = await fetch(`${base}/api/v1/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', service: 'ark305-api' });
  assert.equal((await fetch(`${base}/health`)).status, 404);
  assert.equal((await fetch(`${base}/api/v1/team-proposals`)).status, 401);
  assert.equal(stderr, '');
});
