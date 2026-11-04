import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Auth email templates preserve Supabase links and work without scripts or SVG', () => {
  const directory = new URL('../emails/auth/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('subjects.json', directory), 'utf8'));
  assert.deepEqual(manifest, {
    confirmation: 'Confirm your ARK305 account',
    'magic-link': 'Your ARK305 sign-in link',
    recovery: 'Reset your ARK305 password',
  });
  for (const [name, subject] of Object.entries(manifest)) {
    assert.match(subject, /ARK305/);
    const html = readFileSync(new URL(`${name}.html`, directory), 'utf8');
    assert.match(html, /<html lang="en"/);
    assert.match(html, /href="{{ \.ConfirmationURL }}"/);
    assert.equal((html.match(/<a\b/g) ?? []).length, 1);
    assert.match(html, /{{ \.SiteURL }}\/brand\/ark-logo-email\.png/);
    assert.match(html, /alt="ARK305"/);
    assert.match(html, /If you did not request/);
    assert.doesNotMatch(html, /<script|<svg|<form|on(?:click|load|error)=|data:image|localhost|re_[A-Za-z0-9]{15}/i);
    assert.doesNotMatch(html, /\.RedirectTo|\.TokenHash|\.Data/);
    assert.ok(Buffer.byteLength(html) < 15000);
  }
});

test('Local email preview cannot send email or expose arbitrary files', async (t) => {
  const { createPreviewServer } = await import('../scripts/preview-auth-emails.mjs');
  const server = createPreviewServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(origin)).status, 200);
  for (const name of ['confirmation', 'magic-link', 'recovery']) {
    const response = await fetch(`${origin}/${name}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /href="#preview-only"/);
    assert.doesNotMatch(html, /{{|supabase\.co\/auth/);
  }
  assert.equal((await fetch(`${origin}/logo.png`)).headers.get('content-type'), 'image/png');
  assert.equal((await fetch(`${origin}/.env.local`)).status, 404);
  assert.equal((await fetch(`${origin}/unknown`)).status, 404);
  assert.equal((await fetch(`${origin}/confirmation`, { method: 'POST' })).status, 405);
});
