const { test } = require('node:test');
const assert = require('node:assert/strict');
const { canTransitionRequest } = require('../dist/modules/requests/request-lifecycle');

test('request lifecycle permits management and cancellation of open requests', () => {
  for (const [from, to] of [
    ['received', 'in_progress'], ['in_progress', 'closed'],
    ['received', 'cancelled'], ['in_progress', 'cancelled'],
  ]) assert.equal(canTransitionRequest(from, to), true, `${from} -> ${to}`);
});

test('request lifecycle rejects skipped stages, reopening, repeats and unknown states', () => {
  const states = ['received', 'in_progress', 'closed', 'cancelled'];
  const allowed = new Set(['received:in_progress', 'in_progress:closed', 'received:cancelled', 'in_progress:cancelled']);
  for (const from of states) for (const to of states) {
    assert.equal(canTransitionRequest(from, to), allowed.has(`${from}:${to}`), `${from} -> ${to}`);
  }
  for (const value of ['confirmed', 'paid', '', 'toString', '__proto__', null, undefined, 1, {}]) {
    assert.equal(canTransitionRequest(value, 'in_progress'), false);
    assert.equal(canTransitionRequest('received', value), false);
  }
});
