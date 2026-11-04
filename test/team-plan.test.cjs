const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseTeamPlan, TEAM_SCHEMA } = require('../dist/modules/ai/team-plan');

test('team estimates separate recurring, one-off and quote-only costs', () => {
  const plan = parseTeamPlan({ understood: true, rationale: 'Equipo y servicios para tu negocio.', items: [
    { id: 'r-cm', hours: 10, cadence: 'monthly' },
    { id: 'photo', hours: 2, cadence: 'one_off' },
    { id: 'turn', hours: 0, cadence: 'one_off' },
    { id: 'kitchen', hours: 0, cadence: 'quote' },
  ] });
  assert.equal(plan.monthlyTotal, Math.round(18 * 10 * 4.33));
  assert.equal(plan.oneOffTotal, 845);
  assert.equal(plan.quoteCount, 1);
  assert.equal(plan.items[3].amount, null);
  assert.equal(plan.demo, true);
  assert.equal(TEAM_SCHEMA.additionalProperties, false);
});

test('team output rejects unknown IDs, invented prices, invalid periods and unreadable text', () => {
  const item = { id: 'r-cm', hours: 10, cadence: 'monthly' };
  const valid = { understood: true, rationale: 'Propuesta.', items: [item] };
  for (const patch of [
    { items: [{ ...item, id: 'invented' }] }, { items: [item, item] },
    { items: [{ ...item, price: 1 }] }, { items: [{ ...item, hours: 41 }] },
    { items: [{ id: 'kitchen', hours: 0, cadence: 'monthly' }] },
    { items: [{ id: 'turn', hours: 0, cadence: 'monthly' }] },
    { rationale: 'broken\u0000text' }, { understood: false }, { items: [] },
  ]) assert.equal(parseTeamPlan({ ...valid, ...patch }), null);
  assert.equal(parseTeamPlan({ understood: false, rationale: 'Necesito más información.', items: [] }).items.length, 0);
});
