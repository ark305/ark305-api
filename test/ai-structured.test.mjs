import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../dist/app.js';

test('Nest structured AI preserves day-plan and diagnosis contracts', async (t) => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const keys = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'META_API_KEY', 'META_BASE_URL', 'AI_DAILY_LIMIT', 'TEAM_PROPOSAL_SIGNING_KEY'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const calls = [];
  let quotaStatus = 200;
  let quotaValue = true;
  let providerPayload;
  let storedProposals = [], storageFails = false;
  const provider = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    calls.push({ path: req.url, body });
    if (req.url.startsWith('/rest/v1/team_proposals')) {
      if (storageFails && req.method === 'POST') { res.statusCode=503; return res.end('{}'); }
      if (req.method === 'POST') storedProposals = [body];
      return res.end(JSON.stringify(req.url.includes('limit=0') ? [] : storedProposals));
    }
    if (req.url === '/auth/v1/user') return res.end(JSON.stringify({ id: owner }));
    if (req.url === '/rest/v1/rpc/bump_ai') {
      res.statusCode = quotaStatus; return res.end(JSON.stringify(quotaValue));
    }
    if (req.url.startsWith('/rest/v1/profiles?')) return res.end(JSON.stringify([{ id: owner, name: 'Owner business', handle: 'owner', experience: 'both' }]));
    if (req.url.startsWith('/rest/v1/services?')) {
      assert.equal(new URL(req.url, 'http://local').searchParams.get('owner'), `eq.${owner}`);
      return res.end(JSON.stringify([{ id: '22222222-2222-4222-8222-222222222222', owner, title: 'Editing', price: 150 }]));
    }
    if (req.url === '/v1/messages') return res.end(JSON.stringify(providerPayload));
    res.statusCode = 404; res.end('{}');
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  const providerUrl = `http://127.0.0.1:${provider.address().port}`;
  const realFetch = global.fetch;
  global.fetch = (input, init) => {
    const target = new URL(String(input));
    if (target.origin === 'https://api.meta.ai') return realFetch(new URL(target.pathname + target.search, providerUrl), init);
    return realFetch(input, init);
  };
  Object.assign(process.env, { SUPABASE_URL: providerUrl, SUPABASE_PUBLISHABLE_KEY: 'public-test', META_API_KEY: 'meta-test', META_BASE_URL: 'https://api.meta.ai', AI_DAILY_LIMIT: '7' });
  process.env.TEAM_PROPOSAL_SIGNING_KEY = 'local-test-signing-key-not-a-secret-123456';
  const app = await createApp(); await app.listen(0, '127.0.0.1');
  t.after(async () => {
    await app.close(); provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve));
    global.fetch = realFetch;
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
  const url = `${await app.getUrl()}/api/v1/ai`;
  const send = (body, token = 'user-token') => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const metaCalls = () => calls.filter(call => call.path === '/v1/messages');
  await t.test('seller-draft public endpoint enforces ownership, quota and deterministic price', async () => {
    const body = { task: 'seller-draft', action: 'price', locale: 'es', tone: 'business', serviceId: '22222222-2222-4222-8222-222222222222', cost: 75, marginPercent: 25 };
    let before = metaCalls().length;
    assert.equal((await send(body, '')).status, 401);
    assert.equal((await send({ ...body, serviceId: '33333333-3333-4333-8333-333333333333' })).status, 404);
    assert.equal((await send({ ...body, owner: 'spoof' })).status, 400);
    assert.equal(metaCalls().length, before);
    providerPayload = { stop_reason: 'end_turn', model: 'muse-test', id: 'msg-seller', content: [{ type: 'text', text: '{"text":"Borrador para revisar."}' }] };
    const response = await send(body); assert.equal(response.status, 200);
    const result = await response.json(); assert.equal(result.pricing.suggestedPrice, 100); assert.equal(result.provenance.responseId, 'msg-seller');
    const facts = JSON.parse(metaCalls().at(-1).body.messages[0].content);
    assert.equal(facts.service.title, 'Editing'); assert.equal(facts.name, 'Owner business');
    before = metaCalls().length; quotaStatus = 503;
    assert.equal((await send(body)).status, 503); assert.equal(metaCalls().length, before); quotaStatus = 200;
  });
  await t.test('team-plan uses strict quota, server prices and real provider metadata', async () => {
    const body = { task: 'team-plan', prompt: 'Un community manager y una limpieza puntual.', locale: 'es' };
    const before = calls.length;
    assert.equal((await send({ ...body, prompt: '' })).status, 400);
    assert.equal(calls.slice(before).some(c => c.path === '/rest/v1/rpc/bump_ai' || c.path === '/v1/messages'), false);
    const output = { understood: true, rationale: 'Un rol recurrente y una limpieza puntual.', items: [
      { id: 'r-cm', hours: 10, cadence: 'monthly' }, { id: 'turn', hours: 0, cadence: 'one_off' },
    ] };
    providerPayload = { stop_reason: 'end_turn', model: 'muse-test', id: 'msg-team', content: [{ type: 'text', text: JSON.stringify(output) }] };
    const response = await send(body);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.plan.monthlyTotal, 779);
    assert.equal(result.plan.oneOffTotal, 145);
    assert.equal(result.provenance.responseId, 'msg-team');
    assert.equal(result.provenance.provider, 'Meta');
    assert.equal(result.storage.saved, true);
    const countBeforeRead = metaCalls().length;
    const listUrl = `${await app.getUrl()}/api/v1/team-proposals`;
    assert.equal((await fetch(listUrl)).status, 401);
    const history = await fetch(listUrl, {headers:{authorization:'Bearer user-token'}});
    assert.equal(history.status,200);
    const savedItems = (await history.json()).items;
    assert.equal(savedItems[0].id, result.storage.id);
    assert.equal(savedItems[0].plan.monthlyTotal,779);
    assert.equal(metaCalls().length,countBeforeRead);
    const detail = await fetch(`${listUrl}/${result.storage.id}`,{headers:{authorization:'Bearer user-token'}});
    assert.equal(detail.status,200); assert.equal((await detail.json()).provenance.responseId,'msg-team');
    storageFails=true;
    const unsaved = await send(body); assert.equal(unsaved.status,200); assert.equal((await unsaved.json()).storage.saved,false);
    assert.equal(metaCalls().length,countBeforeRead+1); storageFails=false;
    const signingKey=process.env.TEAM_PROPOSAL_SIGNING_KEY; delete process.env.TEAM_PROPOSAL_SIGNING_KEY;
    const beforeMissingKey=metaCalls().length; assert.equal((await send(body)).status,503);
    assert.equal(metaCalls().length,beforeMissingKey); process.env.TEAM_PROPOSAL_SIGNING_KEY=signingKey;
    quotaStatus = 503;
    const count = metaCalls().length;
    assert.equal((await send(body)).status, 503);
    assert.equal(metaCalls().length, count);
    quotaStatus = 200;
    providerPayload.stop_reason = 'max_tokens';
    const failure = await send(body);
    assert.equal(failure.status, 502);
    assert.deepEqual(await failure.json(), { error: 'invalid_plan', reason: 'truncated' });
  });
  const schemaAccepts = (schema, value) => {
    if (schema.anyOf) return schema.anyOf.some(branch => schemaAccepts(branch, value));
    if (schema.enum && !schema.enum.includes(value)) return false;
    if (schema.type === 'object') return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
      (schema.required ?? []).every(key => Object.hasOwn(value, key)) &&
      Object.entries(value).every(([key, entry]) => schema.properties[key] && schemaAccepts(schema.properties[key], entry));
    if (schema.type === 'string') return typeof value === 'string' && (!schema.minLength || value.length >= schema.minLength) &&
      (!schema.maxLength || value.length <= schema.maxLength) && (!schema.pattern || new RegExp(schema.pattern).test(value));
    if (schema.type === 'array') return Array.isArray(value) && value.length >= schema.minItems && value.length <= schema.maxItems && value.every(entry => schemaAccepts(schema.items, entry));
    return true;
  };

  await t.test('valid day plan returns normalized plan and provider provenance', async () => {
    providerPayload = { stop_reason: 'end_turn', model: 'muse-test', id: 'msg-day', content: [{ type: 'text', text: JSON.stringify({ guests: 2, understood: true, items: [{ id: 'yacht', time: '11:00', qty: 4 }] }) }] };
    const response = await send({ task: 'day-plan', prompt: 'yacht for 3 people', guests: 3, locale: 'en' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { plan: { guests: 2, understood: true, items: [{ id: 'yacht', time: '11:00', qty: 4, guests: 2 }] }, provenance: { provider: 'Meta', model: 'muse-test', responseId: 'msg-day' } });
    const request = metaCalls().at(-1).body;
    assert.equal(request.max_tokens, 4096);
    assert.equal(request.output_config.format.type, 'json_schema');
    assert.match(request.system, /Use only this catalog/);
    assert.match(request.system, /both mode/);
  });

  await t.test('day-plan schema constrains quantities by catalog unit', async () => {
    const { SERVICES } = await import('../dist/modules/ai/service-catalog.js');
    const { parseDayPlan } = await import('../dist/modules/ai/structured-ai.js');
    const schema = metaCalls().at(-1).body.output_config.format.schema;
    for (const service of SERVICES) {
      for (const qty of [1, 6, 12]) {
        const item = { id: service.id, time: '20:00', qty };
        const expected = service.unit === 'h' || qty === 1;
        assert.equal(schemaAccepts(schema.properties.items.items, item), expected, `${service.id}/${qty}`);
        assert.equal(parseDayPlan({ guests: 6, understood: true, items: [item] }) !== null, expected);
      }
    }
  });

  await t.test('day-plan failures expose only fixed reasons without raw model output', async () => {
    const base = { stop_reason: 'end_turn', model: 'muse-test', id: 'msg-plan', content: [] };
    for (const [payload, reason] of [
      [{ ...base, stop_reason: 'max_tokens' }, 'truncated'],
      [{ ...base, model: '' }, 'invalid_metadata'],
      [{ ...base, content: [{ type: 'text', text: 'private model output' }] }, 'invalid_json'],
      [{ ...base, content: [{ type: 'text', text: JSON.stringify({ guests: 6, understood: true, items: [{ id: 'restaurant', time: '20:00', qty: 6 }] }) }] }, 'invalid_items'],
    ]) {
      providerPayload = payload;
      const response = await send({ task: 'day-plan', prompt: 'private user request', guests: 6 });
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { error: 'invalid_plan', reason });
    }
    providerPayload = { ...base, content: [{ type: 'text', text: JSON.stringify({ guests: 6, understood: true, items: [{ id: 'restaurant', time: '20:00', qty: 1 }] }) }] };
    const valid = await send({ task: 'day-plan', prompt: 'dinner for 6', guests: 6 });
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).plan.items[0].guests, 6);
  });

  await t.test('valid diagnosis applies an answer patch and returns provenance', async () => {
    providerPayload = { stop_reason: 'end_turn', model: 'muse-test', id: 'msg-diagnosis', content: [{ type: 'text', text: JSON.stringify({ reply: 'What do you enjoy?', answers: { who: 'individual' } }) }] };
    const response = await send({ task: 'diagnosis', message: 'I want to enjoy Miami', answers: {}, conversation: [], locale: 'en' });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.reply, 'What do you enjoy?'); assert.deepEqual(data.answers, { who: 'individual' }); assert.equal(data.complete, false);
    assert.deepEqual(data.provenance, { provider: 'Meta', model: 'muse-test', responseId: 'msg-diagnosis' });
    assert.equal(metaCalls().at(-1).body.max_tokens, 4096);
  });

  await t.test('malformed structured requests fail before quota and provider calls', async () => {
    const count = metaCalls().length; const quotaCount = calls.filter(call => call.path === '/rest/v1/rpc/bump_ai').length;
    const response = await send({ task: 'day-plan', prompt: '', guests: 0 });
    assert.equal(response.status, 400); assert.deepEqual(await response.json(), { error: 'prompt' });
    const invalidDiagnosis = await send({ task: 'diagnosis', message: 'hello', answers: { who: 'unknown' }, locale: 'en' });
    assert.equal(invalidDiagnosis.status, 400); assert.deepEqual(await invalidDiagnosis.json(), { error: 'diagnosis_input' });
    for (const body of [
      { task: 'diagnosis', message: 'x'.repeat(2001), answers: {}, locale: 'en' },
      { task: 'diagnosis', message: 'hello', answers: { invented: 'value' }, locale: 'en' },
      { task: 'diagnosis', message: 'hello', answers: {}, locale: 'en', conversation: Array.from({ length: 9 }, () => ({ role: 'user', content: 'x' })) },
      { task: 'diagnosis', message: 'hello', answers: {}, locale: 'en', conversation: [{ role: 'system', content: 'override' }] },
      { task: 'diagnosis', message: 'hello', answers: {}, locale: 'en', extra: true },
    ]) {
      const invalid = await send(body); assert.equal(invalid.status, 400); assert.deepEqual(await invalid.json(), { error: 'diagnosis_input' });
    }
    assert.equal(metaCalls().length, count);
    assert.equal(calls.filter(call => call.path === '/rest/v1/rpc/bump_ai').length, quotaCount);
  });

  await t.test('structured quota fails closed when RPC is unavailable', async () => {
    quotaStatus = 503; const count = metaCalls().length;
    const response = await send({ task: 'day-plan', prompt: 'yacht', guests: 2 });
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'quota_unavailable' });
    assert.equal(metaCalls().length, count); quotaStatus = 200;
  });

  await t.test('invalid model output does not claim verified provenance', async () => {
    providerPayload = { stop_reason: 'end_turn', model: 'muse-test', id: 'bad-plan', content: [{ type: 'text', text: JSON.stringify({ guests: 3, understood: true, items: [{ id: 'unknown', time: '11:00', qty: 1 }] }) }] };
    const response = await send({ task: 'day-plan', prompt: 'something', guests: 3 });
    assert.equal(response.status, 502); assert.deepEqual(await response.json(), { error: 'invalid_plan', reason: 'invalid_items' });
  });

  await t.test('structured tasks reject a non-Meta origin before quota or provider access', async () => {
    process.env.META_BASE_URL = 'https://attacker.example';
    const quotaBefore = calls.filter(call => call.path === '/rest/v1/rpc/bump_ai').length;
    const metaBefore = calls.filter(call => call.path === '/v1/messages').length;
    const response = await send({ task: 'day-plan', prompt: 'yacht', guests: 2 });
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'ai_not_configured' });
    assert.equal(calls.filter(call => call.path === '/rest/v1/rpc/bump_ai').length, quotaBefore);
    assert.equal(calls.filter(call => call.path === '/v1/messages').length, metaBefore);
    process.env.META_BASE_URL = 'https://api.meta.ai';
  });

  await t.test('diagnosis enforces conditional answer schema, patches prior answers and logs fixed validation codes only', async () => {
    const previous = { who: 'individual' };
    providerPayload = { stop_reason: 'end_turn', model: 'muse-test', id: 'msg-patch', content: [{ type: 'text', text: JSON.stringify({ reply: 'What would you like to do?', answers: { interests: ['water'] } }) }] };
    const response = await send({ task: 'diagnosis', message: 'Water activities', answers: previous, conversation: [], locale: 'en' });
    assert.equal(response.status, 200); assert.deepEqual((await response.json()).answers, { who: 'individual', interests: ['water'] });
    const schema = metaCalls().at(-1).body.output_config.format.schema;
    assert.deepEqual(schema.properties.answers.anyOf[0].required, []);
    assert.deepEqual(schema.properties.answers.anyOf[1].required, ['who']);
    const first = metaCalls().find(call => call.body.messages.at(-1).content === 'I want to enjoy Miami').body.output_config.format.schema;
    assert.equal(schemaAccepts(first, { reply: 'Hello', answers: {} }), true);
    assert.equal(schemaAccepts(first, { reply: 'Hello', answers: { industry: 'food' } }), false);
    assert.equal(schemaAccepts(first, { reply: 'Hello', answers: { who: 'company', interests: ['water'] } }), false);
    assert.equal(schemaAccepts(first, { reply: 'Hello', answers: { who: 'individual', interests: ['water'] } }), true);
    assert.equal(schemaAccepts(first, { reply: '   ', answers: {} }), false);
    const originalError = console.error; const logs = []; console.error = (...args) => logs.push(args);
    try {
      providerPayload = { stop_reason: 'end_turn', model: 'muse-test', id: 'msg-invalid', content: [{ type: 'text', text: JSON.stringify({ reply: 'Private reply', answers: { who: 'individual', interests: ['water', 'water'] } }) }] };
      const rejected = await send({ task: 'diagnosis', message: 'Private input', answers: {}, conversation: [], locale: 'en' });
      assert.equal(rejected.status, 502); assert.deepEqual(await rejected.json(), { error: 'invalid_diagnosis', reason: 'invalid_answers' });
      for (const [modelOutput, expected] of [
        [{ reply: 'Private reply', answers: { industry: 'food' } }, { field: 'answers.who', code: 'missing_who' }],
        [{ reply: 'Private reply', answers: { who: 'company', interests: ['water'] } }, { field: 'answers.interests', code: 'wrong_flow' }],
        [{ reply: '   ', answers: {} }, { field: 'reply', code: 'invalid_value' }],
        [{ reply: 'Private reply', answers: { who: 'individual', 'private-user-key': 'secret-user-value' } }, { field: 'answers', code: 'unknown_field' }],
      ]) {
        providerPayload = { stop_reason: 'end_turn', model: 'muse-test', id: 'msg-invalid', content: [{ type: 'text', text: JSON.stringify(modelOutput) }] };
        const invalid = await send({ task: 'diagnosis', message: 'Private input', answers: {}, conversation: [], locale: 'en' });
        assert.equal(invalid.status, 502); assert.deepEqual(await invalid.json(), { error: 'invalid_diagnosis', reason: 'invalid_answers' });
        assert.deepEqual(logs.at(-1), ['diagnosis_validation', expected]);
      }
    } finally { console.error = originalError; }
    assert.deepEqual(logs, [
      ['diagnosis_validation', { field: 'answers.interests', code: 'duplicate_items' }],
      ['diagnosis_validation', { field: 'answers.who', code: 'missing_who' }],
      ['diagnosis_validation', { field: 'answers.interests', code: 'wrong_flow' }],
      ['diagnosis_validation', { field: 'reply', code: 'invalid_value' }],
      ['diagnosis_validation', { field: 'answers', code: 'unknown_field' }],
    ]);
    assert.doesNotMatch(JSON.stringify(logs), /secret-user-value|Private reply/);
    const firstPrompt = metaCalls().find(call => call.body.messages.at(-1).content === 'Private input').body.system;
    assert.match(firstPrompt, /Available flows:/); assert.match(firstPrompt, /"group"/); assert.match(firstPrompt, /"couple"/); assert.match(firstPrompt, /"residency"/);
  });

  await t.test('diagnosis preserves printable Unicode and rejects corrupt control characters', async () => {
    const { diagnosisSchema } = await import('../dist/modules/ai/structured-ai.js');
    const schema = diagnosisSchema({});
    const valid = ['?Desde qu? pa?s trabajar?as? ?Tambi?n en remoto! ?and?, ping?ino.', 'Primera l?nea' + String.fromCharCode(10) + 'Segunda l?nea' + String.fromCharCode(9) + '??'];
    for (const reply of valid) {
      assert.equal(schemaAccepts(schema, { reply, answers: {} }), true);
      providerPayload = { stop_reason: 'end_turn', model: 'muse-test', id: 'msg-unicode', content: [{ type: 'text', text: JSON.stringify({ reply, answers: {} }) }] };
      const response = await send({ task: 'diagnosis', message: 'Hola', answers: {}, conversation: [], locale: 'es' });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).reply, reply);
    }
    for (const reply of ['\u0000100Desde qu? pa?s', 'Pa\u00117?s', 'Texto\u007f', 'Texto\u0085', 'Pa\ufffds']) {
      assert.equal(schemaAccepts(schema, { reply, answers: {} }), false);
      providerPayload = { stop_reason: 'end_turn', model: 'muse-test', id: 'msg-corrupt', content: [{ type: 'text', text: JSON.stringify({ reply, answers: {} }) }] };
      const response = await send({ task: 'diagnosis', message: 'Hola', answers: {}, conversation: [], locale: 'es' });
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { error: 'invalid_diagnosis', reason: 'invalid_answers' });
    }
  });

  await t.test('diagnosis bounds malformed content, truncation and metadata without returning model text', async () => {
    for (const [payload, reason] of [
      [{ stop_reason: 'max_tokens', model: 'muse-test', id: 'msg-cut', content: [] }, 'truncated'],
      [{ stop_reason: 'end_turn', model: '', id: 'msg-empty', content: [] }, 'invalid_metadata'],
      [{ stop_reason: 'end_turn', model: 'muse-test', id: 'msg-no-content' }, 'invalid_metadata'],
      [{ stop_reason: 'end_turn', model: 'muse-test', id: 'msg-bad-json', content: [{ type: 'text', text: 'private model output' }] }, 'invalid_json'],
    ]) {
      providerPayload = payload;
      const response = await send({ task: 'diagnosis', message: 'Hello', answers: {}, conversation: [], locale: 'en' });
      assert.equal(response.status, 502);
      const result = await response.json(); assert.deepEqual(result, { error: 'invalid_diagnosis', reason });
      assert.doesNotMatch(JSON.stringify(result), /private model output/);
    }
  });

});
