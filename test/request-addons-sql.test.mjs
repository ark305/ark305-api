import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const directory = new URL('../supabase/migrations/', import.meta.url);
const file = fs.readdirSync(directory).find(name => name.endsWith('_request_addons.sql'));
const sql = fs.readFileSync(new URL(file, directory), 'utf8');

test('migration structurally restricts acceptance and serializes against state changes (not SQL runtime proof)', () => {
  for (const invariant of [/enable row level security/i, /unique \(request_id, service_id\)/i, /grant insert \(request_id, service_id\)/i,
    /parent\.requester_id is distinct from auth\.uid\(\)/i, /for update/i, /parent\.status not in \('received', 'in_progress'\)/i,
    /security definer set search_path = ''/i, /revoke all on function request_management_private\.validate_addon/i]) assert.match(sql, invariant);
  assert.doesNotMatch(sql, /update public\.service_requests|insert into public\.service_requests|grant update|grant delete/i);
});
test('SQL complement pairs match the shared backend catalog helper', async () => {
  const { complementIds } = await import('../dist/modules/ai/catalog-tools.js');
  const groups = [...sql.matchAll(/parent\.service_id (?:in \(([^)]+)\)|= '([^']+)') and new\.service_id (?:in \(([^)]+)\)|= '([^']+)')/g)];
  const quoted = value => [...value.matchAll(/'([^']+)'/g)].map(match => match[1]);
  for (const match of groups) {
    const parents = match[1] ? quoted(match[1]) : [match[2]], children = match[3] ? quoted(match[3]) : [match[4]];
    for (const parent of parents) assert.deepEqual(children, complementIds(parent));
  }
  assert.equal(groups.length, 4);
});
