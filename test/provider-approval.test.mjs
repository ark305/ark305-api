import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IdentityModule } from '../dist/modules/identity/identity.module.js';
import { ProfilesModule } from '../dist/modules/profiles/profiles.module.js';
import { ProviderApprovalService } from '../dist/modules/profiles/provider-approval.service.js';

const member = '11111111-1111-4111-8111-111111111111';
const operator = '44444444-4444-4444-8444-444444444444';
const pending = (userId) => ({ userId, status: 'pending', requestedAt: '2026-11-14T00:00:00Z', decidedAt: null });

function fakePort({ kind = 'member', operators = [] } = {}) {
  const calls = [];
  return {
    calls,
    findOwn: async (_token, id) => (kind === null ? null : { id, handle: 'ada', kind }),
    requestProviderRole: async (token) => { calls.push(['request', token]); return pending(member); },
    isOperator: async (_token, id) => operators.includes(id),
    listProviderApplications: async (_token, status) => { calls.push(['list', status]); return [pending(member)]; },
    decideProviderApplication: async (_token, id, approve) => {
      calls.push(['decide', id, approve]);
      return id === member ? { ...pending(id), status: approve ? 'approved' : 'rejected', decidedAt: '2026-11-14T01:00:00Z' } : null;
    },
  };
}

test('self-service profile writes never grant provider and file an application instead', () => {
  const service = new ProviderApprovalService(fakePort());
  assert.deepEqual(service.gateKind({ kind: 'provider', name: 'Ada' }, null), { value: { kind: 'member', name: 'Ada' }, requested: true });
  assert.deepEqual(service.gateKind({ kind: 'provider' }, 'creator'), { value: { kind: 'creator' }, requested: true });
  assert.deepEqual(service.gateKind({ kind: 'provider' }, 'provider'), { value: { kind: 'provider' }, requested: false });
  assert.deepEqual(service.gateKind({ kind: 'creator' }, 'provider'), { value: { kind: 'creator' }, requested: false });
});

test('applying requires a non-provider profile', async () => {
  const port = fakePort();
  assert.deepEqual(await new ProviderApprovalService(port).apply('tok', member), pending(member));
  assert.deepEqual(port.calls, [['request', 'tok']]);
  await assert.rejects(new ProviderApprovalService(fakePort({ kind: null })).apply('tok', member), { status: 400 });
  await assert.rejects(new ProviderApprovalService(fakePort({ kind: 'provider' })).apply('tok', member), { status: 409 });
  const foreign = { ...fakePort(), requestProviderRole: async () => pending(operator) };
  await assert.rejects(new ProviderApprovalService(foreign).apply('tok', member), { status: 503 });
});

test('only operators list and decide applications', async () => {
  const port = fakePort({ operators: [operator] });
  const service = new ProviderApprovalService(port);
  await assert.rejects(service.list('tok', member), { status: 403 });
  await assert.rejects(service.decide('tok', member, member, 'approve'), { status: 403 });
  assert.equal((await service.list('tok', operator)).length, 1);
  await service.list('tok', operator, 'rejected');
  await assert.rejects(service.list('tok', operator, 'everything'), { status: 400 });
  assert.equal((await service.decide('tok', operator, member.toUpperCase(), 'approve')).status, 'approved');
  assert.equal((await service.decide('tok', operator, member, 'reject')).status, 'rejected');
  await assert.rejects(service.decide('tok', operator, operator, 'approve'), { status: 404 });
  await assert.rejects(service.decide('tok', operator, 'not-a-uuid', 'approve'), { status: 400 });
  await assert.rejects(service.decide('tok', operator, member, 'promote'), { status: 400 });
  assert.deepEqual(port.calls, [['list', 'pending'], ['list', 'rejected'], ['decide', member, true], ['decide', member, false], ['decide', operator, true]]);
});

test('migration guards kind and exposes only operator-gated security-definer RPCs', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261114020000_provider_approval.sql', import.meta.url), 'utf8');
  assert.match(sql, /before insert or update of kind on public\.profiles/);
  assert.match(sql, /current_user in \('anon', 'authenticated'\)/);
  assert.doesNotMatch(sql.match(/function provider_approval_private\.guard_provider_kind\(\)[\s\S]*?\$\$;/)[0], /security definer/);
  for (const fn of ['request_provider_role()', 'decide_provider_application(uuid, boolean)']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn.replace(/[()]/g, '\\$&')} from public, anon, authenticated`));
  }
  assert.match(sql, /request_administrators where user_id = caller/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*provider_applications/);
});

test('profile and approval routes enforce the provider flow over HTTP', async (t) => {
  const saved = Object.fromEntries(['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'].map((key) => [key, process.env[key]]));
  const profiles = new Map(); const applications = new Map(); const writes = [];
  const caller = (req) => (req.headers.authorization === 'Bearer operator-token' ? operator : member);
  const supabase = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/auth/v1/user') return res.end(JSON.stringify({ id: caller(req) }));
    let body = ''; for await (const chunk of req) body += chunk;
    const url = new URL(req.url, 'http://supabase.test'); const id = caller(req);
    const send = (rows, status = 200) => { res.statusCode = status; res.end(JSON.stringify(rows)); };
    const table = url.pathname.replace('/rest/v1/', '');
    if (table === 'profiles') {
      if (req.method === 'GET') return send([...profiles.values()].filter((row) => !url.searchParams.has('id') || row.id === url.searchParams.get('id').slice(3))
        .filter((row) => !url.searchParams.has('handle') || row.handle === url.searchParams.get('handle').slice(3)));
      const data = JSON.parse(body); writes.push(data);
      if (data.kind === 'provider' && profiles.get(id)?.kind !== 'provider') return send({ code: '42501' }, 403);
      const row = { ...(profiles.get(id) ?? {}), ...data, id }; profiles.set(id, row); return send([row], req.method === 'POST' ? 201 : 200);
    }
    if (table === 'request_administrators') return send(id === operator && url.searchParams.get('user_id') === `eq.${operator}` ? [{ user_id: operator }] : []);
    if (table === 'provider_applications') {
      const status = url.searchParams.get('status')?.slice(3); const user = url.searchParams.get('user_id')?.slice(3);
      const rows = [...applications.values()].filter((row) => (id === operator || row.user_id === id) && (!status || row.status === status) && (!user || row.user_id === user));
      return send(rows.map((row) => (url.searchParams.get('select').includes('profile:') ? { ...row, profile: { handle: profiles.get(row.user_id)?.handle, name: 'Ada', kind: profiles.get(row.user_id)?.kind } } : row)));
    }
    if (table === 'rpc/request_provider_role') {
      const row = applications.get(id)?.status === 'pending' ? applications.get(id) : { user_id: id, status: 'pending', requested_at: '2026-11-14T00:00:00Z', decided_at: null };
      applications.set(id, row); return send([row]);
    }
    if (table === 'rpc/decide_provider_application') {
      const { applicant, approve } = JSON.parse(body); const row = applications.get(applicant);
      if (id !== operator) return send({ code: '42501' }, 403);
      if (!row || row.status !== 'pending') return send([]);
      Object.assign(row, { status: approve ? 'approved' : 'rejected', decided_at: '2026-11-14T01:00:00Z' });
      if (approve) profiles.get(applicant).kind = 'provider';
      return send([row]);
    }
    send({}, 404);
  });
  await new Promise((resolve) => supabase.listen(0, '127.0.0.1', resolve));
  process.env.SUPABASE_URL = `http://127.0.0.1:${supabase.address().port}`;
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-public-key';
  class TestModule {}
  Module({ imports: [IdentityModule, ProfilesModule] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  app.setGlobalPrefix('api/v1'); await app.listen(0, '127.0.0.1');
  t.after(async () => {
    await app.close(); supabase.closeAllConnections(); await new Promise((resolve) => supabase.close(resolve));
    for (const [key, value] of Object.entries(saved)) value === undefined ? delete process.env[key] : process.env[key] = value;
  });
  const base = `${await app.getUrl()}/api/v1/profiles`;
  const as = (token) => ({ authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
  const call = async (path, token, method = 'GET', body) => {
    const response = await fetch(`${base}${path}`, { method, headers: as(token), ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };

  const profile = { handle: 'ada', name: 'Ada', kind: 'provider', role: '', area: '', tagline: '', photo_url: null, banner_url: null, gallery: [], instagram: null, tiktok: null, facebook: null };
  assert.equal((await fetch(`${base}/me/provider-application`, { method: 'POST' })).status, 401);
  const created = await call('/me', 'member-token', 'POST', { handle: 'ada', name: 'Ada', kind: 'provider', role: '', area: '', photo_url: null });
  assert.equal(created.status, 201);
  assert.equal(created.body.kind, 'member');
  assert.equal(created.body.providerApplication.status, 'pending');
  assert.ok(writes.every((write) => write.kind !== 'provider'));

  const edited = await call('/me', 'member-token', 'PATCH', { ...profile, name: 'Ada L', kind: 'provider' });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.kind, 'member');
  assert.equal((await call('/me/provider-application', 'member-token')).body.application.status, 'pending');

  assert.equal((await call('/provider-applications', 'member-token')).status, 403);
  assert.equal((await call(`/provider-applications/${member}/approve`, 'member-token', 'POST')).status, 403);
  const queue = await call('/provider-applications', 'operator-token');
  assert.equal(queue.status, 200);
  assert.deepEqual(queue.body.items.map((item) => [item.userId, item.profile.handle]), [[member, 'ada']]);

  const approved = await call(`/provider-applications/${member}/approve`, 'operator-token', 'POST');
  assert.equal(approved.status, 200);
  assert.equal(approved.body.application.status, 'approved');
  assert.equal(profiles.get(member).kind, 'provider');
  assert.equal((await call(`/provider-applications/${member}/reject`, 'operator-token', 'POST')).status, 404);
  assert.equal((await call('/me/provider-application', 'member-token', 'POST')).status, 409);

  const keep = await call('/me', 'member-token', 'PATCH', { ...profile, kind: 'provider' });
  assert.equal(keep.status, 200);
  assert.equal(keep.body.kind, 'provider');
  assert.equal('providerApplication' in keep.body, false);
});
