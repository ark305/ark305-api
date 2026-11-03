const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createServer } = require('node:http');
const { test } = require('node:test');
require('reflect-metadata');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { IdentityModule } = require('../dist/modules/identity/identity.module');
const { ProfilesModule } = require('../dist/modules/profiles/profiles.module');

class SnapshotTestModule {}
Module({ imports: [IdentityModule, ProfilesModule] })(SnapshotTestModule);

const cases = [
  {
    answers: { who: 'individual', interests: ['water', 'food'], group: 'friends', budget: 'signature', pace: 'full', residency: 'full', support: 'none', offer: ['no'] },
    digest: '5ef777d4bcf0e220901370e2f802561a00c87ea4284cfca9994b04403749848a',
  },
  {
    answers: { who: 'earner', skills: ['photo', 'ugc'], hours: '20', where: 'remote', country: 'Colombia', assets: ['laptop'], blocker: 'rates', need: ['clients'] },
    digest: '1c3a13ee8d2b9eb110584265969ebf6fa7dddc6590c31be1c8df58be6cd01461',
  },
  {
    answers: { who: 'company', industry: 'food', team: 'large', revenue: '20-100', breaking: 'cash', goal: 'sell' },
    digest: 'c9f2905c6c707bd4009198f4e334845dcf3e76cac81a307208dee0431e0fcdbe',
  },
  {
    answers: { who: 'enterprise' },
    digest: '7ea28a2e05a076b84188bdb911c1155e96dc2303dd1b519757e1745da7a61329',
  },
];

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  }
  return value;
}

function snapshotDigest(snapshot) {
  return createHash('sha256').update(JSON.stringify(sortKeys(snapshot))).digest('hex');
}

test('public snapshot endpoint matches the previous client output for every diagnosis audience without touching Supabase', async (t) => {
  const saved = Object.fromEntries(['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'].map((key) => [key, process.env[key]]));
  const providerCalls = [];
  const provider = createServer((req, res) => {
    providerCalls.push({ method: req.method, url: req.url });
    res.writeHead(404, { 'Content-Type': 'application/json' }).end('{}');
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  process.env.SUPABASE_URL = `http://127.0.0.1:${provider.address().port}`;
  process.env.SUPABASE_PUBLISHABLE_KEY = 'snapshot-test-publishable-key';
  const app = await NestFactory.create(SnapshotTestModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  await app.listen(0, '127.0.0.1');
  t.after(async () => {
    await app.close();
    provider.closeAllConnections();
    await new Promise((resolve) => provider.close(resolve));
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  const url = `${await app.getUrl()}/api/v1/profiles/snapshot`;
  for (const { answers, digest } of cases) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    });
    assert.equal(response.status, 200, answers.who);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const result = await response.json();
    assert.equal(snapshotDigest(result.snapshot), digest, answers.who);
    if (answers.who === 'individual') {
      for (const locale of ['es', 'en']) {
        const gaps = result.snapshot.gaps.map((item) => item[locale]).join(' ');
        assert.doesNotMatch(gaps, /no tienes días guardados|No saved days/i);
      }
    }
  }
  assert.deepEqual(providerCalls, [], 'stateless public snapshots must not call Supabase Auth or data APIs');
});

test('snapshot endpoint rejects malformed, unexpected, and oversized bodies', async (t) => {
  const provider = createServer((_req, res) => res.writeHead(404).end('{}'));
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const saved = Object.fromEntries(['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'].map((key) => [key, process.env[key]]));
  process.env.SUPABASE_URL = `http://127.0.0.1:${provider.address().port}`;
  process.env.SUPABASE_PUBLISHABLE_KEY = 'snapshot-test-publishable-key';
  const app = await NestFactory.create(SnapshotTestModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  await app.listen(0, '127.0.0.1');
  t.after(async () => {
    await app.close(); provider.closeAllConnections(); await new Promise((resolve) => provider.close(resolve));
    for (const [key, value] of Object.entries(saved)) value === undefined ? delete process.env[key] : process.env[key] = value;
  });

  const url = `${await app.getUrl()}/api/v1/profiles/snapshot`;
  for (const body of [null, [], { answers: null }, { answers: { who: 'individual' }, userId: 'untrusted' }, { answers: { unknown: 'x'.repeat(17_000) } }]) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 400);
  }
});
