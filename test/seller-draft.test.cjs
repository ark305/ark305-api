const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SellerDraftService } = require('../dist/modules/ai/seller-draft');
const owner = '11111111-1111-4111-8111-111111111111';
const serviceId = '22222222-2222-4222-8222-222222222222';
function fixture() {
  const calls = [];
  const profile = { id: owner, name: 'Business', handle: 'business' };
  const service = { id: serviceId, owner, title: 'Editing', price: 100 };
  const profiles = { findOwn: async () => profile, listServices: async () => [service] };
  const context = { load: async (...args) => { calls.push(['context', ...args]); return ''; } };
  const meta = { configuration: () => {}, structured: async (...args) => { calls.push(['meta', ...args]); return { stop_reason: 'end_turn', id: 'msg-real', model: 'muse-test', content: [{ type: 'text', text: '{"text":"Draft to review."}' }] }; } };
  return { calls, profiles, service, meta, sut: new SellerDraftService(profiles, context, meta) };
}
const base = { task: 'seller-draft', action: 'post', locale: 'en', tone: 'business', serviceId };
test('seller drafts use own service and deterministic gross margin without publishing', async () => {
  const f = fixture();
  for (const input of [base, { ...base, action: 'reply', customerMessage: 'What does this include?' }, { ...base, action: 'price', cost: 75, marginPercent: 25 }]) {
    const out = await f.sut.generate(input, 'token', owner);
    assert.equal(out.draft.text, 'Draft to review.'); assert.equal(out.provenance.provider, 'Meta');
    if (input.action === 'price') assert.deepEqual(out.pricing, { cost: 75, marginPercent: 25, suggestedPrice: 100, currency: 'USD' });
    else assert.equal(out.pricing, undefined);
  }
  assert.equal(f.calls.filter(c => c[0] === 'meta').length, 3);
  assert.ok(f.calls.filter(c => c[0] === 'context').every(c => c[4] === true));
});
test('seller rejects malformed input and foreign or missing services before provider and quota', async () => {
  const f = fixture();
  for (const input of [{ ...base, owner: 'spoof' }, { ...base, action: 'reply' }, { ...base, action: 'price', cost: 75, marginPercent: 100 },
    { ...base, action: 'price', cost: -1, marginPercent: 25 }, { ...base, action: ['post'] }]) await assert.rejects(f.sut.generate(input, 'token', owner));
  f.service.owner = 'another-user'; await assert.rejects(f.sut.generate(base, 'token', owner));
  f.profiles.findOwn = async () => null; await assert.rejects(f.sut.generate(base, 'token', owner));
  assert.equal(f.calls.length, 0);
});
test('seller does not replace truncated, malformed or unreadable provider output', async () => {
  for (const payload of [
    { stop_reason: 'max_tokens' }, { stop_reason: 'end_turn', model: '', id: 'id', content: [] },
    { stop_reason: 'end_turn', model: 'muse', id: 'id', content: [{ type: 'text', text: '{"text":"bad\\u0000text"}' }] },
    { stop_reason: 'end_turn', model: 'muse', id: 'id', content: [{ type: 'text', text: '{"text":"ok","sent":true}' }] },
  ]) { const f = fixture(); f.meta.structured = async () => payload; await assert.rejects(f.sut.generate(base, 'token', owner)); }
});
