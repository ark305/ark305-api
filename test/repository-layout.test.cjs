const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

test('standalone API owns its schema and RLS fixtures without a web checkout', () => {
  const root = path.resolve(__dirname, '..');
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
