const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { createApp } = require('../dist/app');

test('Nest structured AI preserves day-plan and diagnosis contracts', async (t) => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const keys = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'META_API_KEY', 'META_BASE_URL', 'AI_DAILY_LIMIT'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const calls = [];
  let quotaStatus = 200;
  let quotaValue = true;
  let providerPayload;
  const provider = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    calls.push({ path: req.url, body });
    if (req.url === '/auth/v1/user') return res.end(JSON.stringify({ id: owner }));
    if (req.url === '/rest/v1/rpc/bump_ai') {
      res.statusCode = quotaStatus; return res.end(JSON.stringify(quotaValue));
    }
    if (req.url.startsWith('/rest/v1/profiles?')) return res.end(JSON.stringify([{ experience: 'both' }]));
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
  const app = await createApp(); await app.listen(0, '127.0.0.1');
  t.after(async () => {
    await app.close(); provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve));
    global.fetch = realFetch;
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
  const url = `${await app.getUrl()}/api/v1/ai`;
  const send = (body, token = 'user-token') => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const metaCalls = () => calls.filter(call => call.path === '/v1/messages');
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
    assert.equal(request.max_tokens, 1500);
    assert.equal(request.output_config.format.type, 'json_schema');
    assert.match(request.system, /Use only this catalog/);
    assert.match(request.system, /both mode/);
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
    assert.equal(response.status, 502); assert.deepEqual(await response.json(), { error: 'invalid_plan' });
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
