import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { getGhlConfig } from '../dist/modules/ghl/ghl-config.js';
import { GhlClient } from '../dist/modules/ghl/ghl.client.js';
import { GhlService, parseContactInput, parseMessageInput, parseServiceOrder } from '../dist/modules/ghl/ghl.service.js';
import { createApp } from '../dist/application.js';

const CONFIG = { apiKey: 'test-ghl', locationId: 'loc123', baseUrl: new URL('https://services.leadconnectorhq.com'), pipelineId: 'pipe1', pipelineStageId: 'stage1' };

function fakeClient(response, config = CONFIG) {
  const calls = [];
  return {
    calls,
    config: () => config,
    request: async request => { calls.push(request); return typeof response === 'function' ? response(request) : structuredClone(response); },
  };
}

const status = async (promise) => { try { await promise; } catch (error) { return error.getStatus(); } return 200; };

test('GHL config comes only from the environment and rejects unsafe values', () => {
  assert.equal(getGhlConfig({}), null);
  assert.equal(getGhlConfig({ GHL_API_KEY: 'k' }), null);
  assert.equal(getGhlConfig({ GHL_API_KEY: 'k', GHL_LOCATION_ID: 'bad id' }), null);
  const config = getGhlConfig({ GHL_API_KEY: ' k ', GHL_LOCATION_ID: 'loc1', GHL_PIPELINE_ID: 'p1' });
  assert.equal(config.apiKey, 'k');
  assert.equal(config.baseUrl.origin, 'https://services.leadconnectorhq.com');
  assert.equal(config.pipelineId, 'p1');
  assert.equal(config.pipelineStageId, undefined);
  for (const base of ['http://example.com', 'https://u:p@example.com', 'https://example.com/v1', 'not a url']) {
    assert.equal(getGhlConfig({ GHL_API_KEY: 'k', GHL_LOCATION_ID: 'loc1', GHL_BASE_URL: base }), null, base);
  }
  assert.ok(getGhlConfig({ GHL_API_KEY: 'k', GHL_LOCATION_ID: 'loc1', GHL_BASE_URL: 'http://127.0.0.1:9999' }));
});

test('contact upsert scopes to the configured location and maps only known fields', async () => {
  const client = fakeClient({ new: true, traceId: 't', contact: { id: 'c1', email: 'ana@ark305.com', phone: '+13055550100', firstName: 'Ana', lastName: null, tags: ['vip', 3], customFields: [{ secret: true }] } });
  const service = new GhlService(client);
  const input = parseContactInput({ firstName: ' Ana ', email: 'Ana@ARK305.com', phone: '+1 (305) 555-0100', tags: ['vip', 'vip'] }, false);
  assert.deepEqual(await service.upsertContact(input), {
    created: true,
    contact: { id: 'c1', email: 'ana@ark305.com', phone: '+13055550100', firstName: 'Ana', lastName: null, tags: ['vip'] },
  });
  assert.deepEqual(client.calls, [{ method: 'POST', path: '/contacts/upsert', version: '2021-07-28',
    body: { firstName: 'Ana', email: 'ana@ark305.com', phone: '+13055550100', tags: ['vip'], locationId: 'loc123', source: 'ARK305' } }]);
});

test('contact update targets the contact ID without a location override', async () => {
  const client = fakeClient({ succeded: true, contact: { id: 'c1', firstName: 'Ana' } });
  const contact = await new GhlService(client).updateContact('c1', parseContactInput({ lastName: 'Ruiz' }, true));
  assert.equal(contact.id, 'c1');
  assert.deepEqual(client.calls[0], { method: 'PUT', path: '/contacts/c1', version: '2021-07-28', body: { lastName: 'Ruiz' } });
  assert.equal(await status(new GhlService(client).updateContact('../x', {})), 400);
});

test('contact parsing rejects unknown keys, bad formats and empty identities', () => {
  for (const [body, partial] of [
    [{}, false], [{ firstName: 'Ana' }, false], [{}, true], [null, false], [[], false],
    [{ email: 'nope' }, false], [{ phone: '3055550100' }, false], [{ email: 'a@b.co', locationId: 'other' }, false],
    [{ email: 'a@b.co', tags: 'vip' }, false], [{ email: 'a@b.co', timezone: 'Mars/Base' }, false],
    [{ email: 'a@b.co', firstName: 'x'.repeat(121) }, false], [{ email: 'a@b.co', firstName: 'bad\u0000' }, false],
  ]) assert.throws(() => parseContactInput(body, partial), error => error.getStatus() === 400, JSON.stringify(body));
  assert.deepEqual(parseContactInput({ phone: '+13055550100', timezone: 'America/New_York' }, false), { phone: '+13055550100', timezone: 'America/New_York' });
});

test('service orders become open opportunities in the env-configured pipeline and stage', async () => {
  const client = fakeClient({ opportunity: { id: 'o1', name: 'Yate 50 ft', contactId: 'c1', pipelineId: 'pipe1', pipelineStageId: 'stage1', status: 'open', monetaryValue: 1200.5 } });
  const order = parseServiceOrder({ contactId: 'c1', name: ' Yate 50 ft ', monetaryValue: 1200.499, serviceId: 'yacht', requestId: '22222222-2222-4222-8222-222222222222' });
  assert.deepEqual(await new GhlService(client).createServiceOrder(order),
    { id: 'o1', name: 'Yate 50 ft', contactId: 'c1', pipelineId: 'pipe1', pipelineStageId: 'stage1', status: 'open', monetaryValue: 1200.5 });
  assert.deepEqual(client.calls[0], { method: 'POST', path: '/opportunities/', version: '2021-07-28', body: {
    locationId: 'loc123', pipelineId: 'pipe1', pipelineStageId: 'stage1', name: 'Yate 50 ft', status: 'open', contactId: 'c1',
    monetaryValue: 1200.5, source: 'ARK305 service:yacht request:22222222-2222-4222-8222-222222222222' } });
});

test('service orders fail closed without a pipeline and omit an unset stage', async () => {
  const missing = fakeClient({}, { ...CONFIG, pipelineId: undefined });
  await assert.rejects(new GhlService(missing).createServiceOrder({ contactId: 'c1', name: 'x' }),
    error => error.getStatus() === 503 && error.getResponse().error === 'ghl_pipeline_not_configured');
  assert.equal(missing.calls.length, 0);
  const noStage = fakeClient({ opportunity: { id: 'o2' } }, { ...CONFIG, pipelineStageId: undefined });
  const result = await new GhlService(noStage).createServiceOrder({ contactId: 'c1', name: 'Chef' });
  assert.equal('pipelineStageId' in noStage.calls[0].body, false);
  assert.equal('monetaryValue' in noStage.calls[0].body, false);
  assert.deepEqual(result, { id: 'o2', name: 'Chef', contactId: 'c1', pipelineId: 'pipe1', pipelineStageId: null, status: 'open', monetaryValue: null });
  for (const body of [{ contactId: 'c1' }, { contactId: 'c1', name: 'x', monetaryValue: -1 }, { contactId: 'c1', name: 'x', monetaryValue: '5' },
    { contactId: 'c1', name: 'x', pipelineId: 'other' }, { contactId: 'c 1', name: 'x' }, { contactId: 'c1', name: 'x', serviceId: 'a b' }]) {
    assert.throws(() => parseServiceOrder(body), error => error.getStatus() === 400, JSON.stringify(body));
  }
});

test('messages map sms/whatsapp to GHL channel types', async () => {
  const client = fakeClient({ conversationId: 'conv1', messageId: 'm1', status: 'pending', msg: 'queued' });
  const service = new GhlService(client);
  assert.deepEqual(await service.sendMessage(parseMessageInput({ contactId: 'c1', channel: 'sms', message: 'Hola' })), { conversationId: 'conv1', messageId: 'm1', status: 'pending' });
  await service.sendMessage(parseMessageInput({ contactId: 'c1', channel: 'whatsapp', message: 'Hi' }));
  assert.deepEqual(client.calls.map(call => [call.path, call.version, call.body.type]),
    [['/conversations/messages', '2021-04-15', 'SMS'], ['/conversations/messages', '2021-04-15', 'WhatsApp']]);
  for (const body of [{ contactId: 'c1', channel: 'email', message: 'x' }, { contactId: 'c1', channel: 'sms', message: '' },
    { contactId: 'c1', channel: 'sms', message: 'x'.repeat(1601) }, { contactId: 'c1', channel: 'sms', message: 'x', toNumber: '+1' }]) {
    assert.throws(() => parseMessageInput(body), error => error.getStatus() === 400, JSON.stringify(body));
  }
  await assert.rejects(new GhlService(fakeClient({ status: 'failed' })).sendMessage({ contactId: 'c1', channel: 'sms', message: 'x' }),
    error => error.getStatus() === 502);
});

test('calendars list only published calendars for the location', async () => {
  const client = fakeClient({ calendars: [
    { id: 'cal1', name: 'Yates', description: 'Biscayne', isActive: true, slotDuration: 60, slotDurationUnit: 'mins', notifications: [{ secret: 1 }] },
    { id: 'cal2', name: 'Chef', isActive: false }, { name: 'missing id' }, 'junk',
  ] });
  assert.deepEqual(await new GhlService(client).listCalendars(), [
    { id: 'cal1', name: 'Yates', description: 'Biscayne', isActive: true, slotDuration: 60, slotDurationUnit: 'mins' },
    { id: 'cal2', name: 'Chef', description: null, isActive: false, slotDuration: null, slotDurationUnit: null },
  ]);
  assert.deepEqual(client.calls[0], { method: 'GET', path: '/calendars/', version: '2021-04-15', query: { locationId: 'loc123', showDrafted: 'false' } });
  await assert.rejects(new GhlService(fakeClient({})).listCalendars(), error => error.getStatus() === 502);
});

test('availability converts whole UTC days to epoch ms and returns sorted slots', async () => {
  const client = fakeClient({ '2027-01-16': { slots: ['2027-01-16T10:00:00-05:00'] }, '2027-01-15': { slots: ['2027-01-15T09:00:00-05:00', 7] }, traceId: 'x' });
  const result = await new GhlService(client).availability('cal1', '2027-01-15', '2027-01-16', 'America/New_York');
  assert.deepEqual(result, { calendarId: 'cal1', timezone: 'America/New_York', days: [
    { date: '2027-01-15', slots: ['2027-01-15T09:00:00-05:00'] }, { date: '2027-01-16', slots: ['2027-01-16T10:00:00-05:00'] }] });
  assert.deepEqual(client.calls[0], { method: 'GET', path: '/calendars/cal1/free-slots', version: '2021-04-15',
    query: { startDate: String(Date.UTC(2027, 0, 15)), endDate: String(Date.UTC(2027, 0, 17) - 1), timezone: 'America/New_York' } });
  const service = new GhlService(fakeClient({}));
  for (const args of [['cal1', '2027-01-16', '2027-01-15'], ['cal1', '2027-01-01', '2027-02-01'], ['cal1', '2027-02-30', '2027-03-01'],
    ['cal1', '15/01/2027', '2027-01-16'], ['cal1', undefined, '2027-01-16'], ['cal/1', '2027-01-15', '2027-01-16'], ['cal1', '2027-01-15', '2027-01-16', 'Nowhere']]) {
    assert.equal(await status(service.availability(...args)), 400, JSON.stringify(args));
  }
});

test('GHL client sends v2 headers, maps errors to fixed codes and never leaks provider bodies', async (t) => {
  const keys = ['GHL_API_KEY', 'GHL_LOCATION_ID', 'GHL_BASE_URL'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const seen = []; let reply = { status: 200, body: { ok: true } };
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    seen.push({ method: req.method, url: req.url, headers: req.headers, body: raw });
    res.statusCode = reply.status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(reply.body));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
  const client = new GhlClient();
  for (const key of keys) delete process.env[key];
  await assert.rejects(client.request({ method: 'GET', path: '/calendars/', version: '2021-04-15' }),
    error => error.getStatus() === 503 && error.getResponse().error === 'ghl_not_configured');
  assert.equal(seen.length, 0);

  Object.assign(process.env, { GHL_API_KEY: 'test-ghl', GHL_LOCATION_ID: 'loc123', GHL_BASE_URL: `http://127.0.0.1:${server.address().port}` });
  assert.deepEqual(await client.request({ method: 'POST', path: '/contacts/upsert', version: '2021-07-28', query: { a: 'b' }, body: { x: 1 } }), { ok: true });
  assert.equal(seen[0].url, '/contacts/upsert?a=b');
  assert.equal(seen[0].headers.authorization, 'Bearer test-ghl');
  assert.equal(seen[0].headers.version, '2021-07-28');
  assert.equal(seen[0].headers['content-type'], 'application/json');
  assert.equal(seen[0].body, '{"x":1}');

  for (const [code, body, expected, error] of [[429, {}, 429, 'rate_limited'], [500, { message: 'private contact ana@x.com' }, 502, 'ghl_upstream'],
    [401, { message: 'bad token' }, 502, 'ghl_upstream'], [200, [1, 2], 502, 'ghl_upstream']]) {
    reply = { status: code, body };
    await assert.rejects(client.request({ method: 'GET', path: '/calendars/', version: '2021-04-15' }), e => {
      assert.equal(e.getStatus(), expected); assert.deepEqual(e.getResponse(), { error }); return true;
    });
  }
});

test('GHL HTTP routes require identity, and writes require an operator', async (t) => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const keys = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'GHL_API_KEY', 'GHL_LOCATION_ID', 'GHL_BASE_URL', 'GHL_PIPELINE_ID', 'GHL_PIPELINE_STAGE_ID'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const ghlCalls = [];
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    let raw = ''; for await (const chunk of req) raw += chunk;
    const operator = req.headers.authorization === 'Bearer operator';
    if (req.url === '/auth/v1/user') return res.end(JSON.stringify({ id: owner }));
    if (req.url.startsWith('/rest/v1/request_administrators?')) return res.end(JSON.stringify(operator ? [{ user_id: owner }] : []));
    ghlCalls.push({ url: req.url, body: raw && JSON.parse(raw) });
    if (req.url === '/contacts/upsert') return res.end(JSON.stringify({ new: false, contact: { id: 'c1', email: 'ana@ark305.com' } }));
    if (req.url === '/opportunities/') return res.end(JSON.stringify({ opportunity: { id: 'o1', name: 'Yate', contactId: 'c1', status: 'open' } }));
    if (req.url === '/conversations/messages') return res.end(JSON.stringify({ conversationId: 'conv1', messageId: 'm1', status: 'pending' }));
    if (req.url.startsWith('/calendars/?')) return res.end(JSON.stringify({ calendars: [{ id: 'cal1', name: 'Yates' }] }));
    if (req.url.startsWith('/calendars/cal1/free-slots?')) return res.end(JSON.stringify({ '2027-01-15': { slots: ['2027-01-15T09:00:00-05:00'] } }));
    res.statusCode = 404; res.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  Object.assign(process.env, { SUPABASE_URL: base, SUPABASE_PUBLISHABLE_KEY: 'test-public', GHL_API_KEY: 'test-ghl', GHL_LOCATION_ID: 'loc123', GHL_BASE_URL: base, GHL_PIPELINE_ID: 'pipe1', GHL_PIPELINE_STAGE_ID: 'stage1' });
  const app = await createApp(); await app.listen(0, '127.0.0.1');
  t.after(async () => {
    await app.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
  const api = `${await app.getUrl()}/api/v1/ghl`;
  const call = (path, { method = 'GET', body, token = 'operator' } = {}) => fetch(`${api}${path}`, { method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });

  const writes = [['/contacts', 'POST', { email: 'ana@ark305.com' }], ['/contacts/c1', 'PUT', { firstName: 'Ana' }],
    ['/opportunities', 'POST', { contactId: 'c1', name: 'Yate' }], ['/messages', 'POST', { contactId: 'c1', channel: 'whatsapp', message: 'Hola' }]];
  for (const [path, method, body] of writes) {
    assert.equal((await call(path, { method, body, token: null })).status, 401, path);
    assert.equal((await call(path, { method, body, token: 'customer' })).status, 403, path);
  }
  assert.equal((await call('/calendars', { token: null })).status, 401);
  assert.equal(ghlCalls.length, 0);

  const contact = await call('/contacts', { method: 'POST', body: { email: 'ana@ark305.com' } });
  assert.equal(contact.status, 200);
  assert.equal(contact.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await contact.json(), { created: false, contact: { id: 'c1', email: 'ana@ark305.com', phone: null, firstName: null, lastName: null, tags: [] } });
  const opportunity = await call('/opportunities', { method: 'POST', body: { contactId: 'c1', name: 'Yate', serviceId: 'yacht' } });
  assert.equal(opportunity.status, 201);
  assert.equal((await opportunity.json()).opportunity.id, 'o1');
  assert.equal(ghlCalls.at(-1).body.pipelineId, 'pipe1');
  const message = await call('/messages', { method: 'POST', body: { contactId: 'c1', channel: 'whatsapp', message: 'Hola' } });
  assert.equal(message.status, 201);
  assert.deepEqual(await message.json(), { message: { conversationId: 'conv1', messageId: 'm1', status: 'pending' } });
  assert.equal(ghlCalls.at(-1).body.type, 'WhatsApp');
  assert.equal((await call('/messages', { method: 'POST', body: { contactId: 'c1', channel: 'fax', message: 'x' } })).status, 400);

  const calendars = await call('/calendars', { token: 'customer' });
  assert.equal(calendars.status, 200);
  assert.equal((await calendars.json()).items[0].id, 'cal1');
  const slots = await call('/calendars/cal1/free-slots?startDate=2027-01-15&endDate=2027-01-15', { token: 'customer' });
  assert.equal(slots.status, 200);
  assert.deepEqual((await slots.json()).days, [{ date: '2027-01-15', slots: ['2027-01-15T09:00:00-05:00'] }]);
  assert.equal((await call('/calendars/cal1/free-slots?startDate=2027-01-15', { token: 'customer' })).status, 400);
});
