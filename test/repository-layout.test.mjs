import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

test('standalone API owns its schema and RLS fixtures without a web checkout', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies['@nestjs/core']);
  assert.equal(pkg.dependencies.next, undefined);
  for (const file of ['schema.sql', '002_experiences.sql',
    'migrations/20261031031940_service_requests.sql',
    'migrations/20261102232604_request_management.sql']) {
    assert.ok(fs.existsSync(path.join(root, 'supabase', file)), file);
  }
  const rls = fs.readFileSync(path.join(root, 'test/requests-rls.cjs'), 'utf8');
  assert.doesNotMatch(rls, /\.\.\/\.\.\/supabase/);
  assert.match(rls, /\.\.\/supabase\/migrations/);
  const ignored = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(ignored, /^\.env\*/m);
  assert.match(ignored, /^!\.env\.example/m);
});
