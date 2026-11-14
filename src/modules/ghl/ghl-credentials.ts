import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

// Provider GHL tokens are sealed here with AES-256-GCM before they reach Supabase, so the database (and anyone
// reading it with a JWT) only ever sees ciphertext. The additional data binds a ciphertext to its provider and
// location, so a sealed token copied into another row does not open.
const VERSION = 'v1';
const SEALED = /^v1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{1,6000})$/;

function key(env: NodeJS.ProcessEnv): Buffer | null {
  const secret = env.GHL_CREDENTIALS_KEY;
  if (!secret || secret.length < 32) return null;
  return Buffer.from(hkdfSync('sha256', secret, 'ark305-ghl-provider-accounts', 'aes-256-gcm token v1', 32));
}

const additionalData = (providerId: string, locationId: string) => Buffer.from(`ghl-provider-account:${VERSION}:${providerId}:${locationId}`);

export function ghlCredentialsKeyConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return key(env) !== null;
}

export function sealGhlToken(token: string, providerId: string, locationId: string, env: NodeJS.ProcessEnv = process.env): string {
  const secret = key(env);
  if (!secret) throw new Error('GHL_CREDENTIALS_KEY missing');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secret, iv);
  cipher.setAAD(additionalData(providerId, locationId));
  const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

export function openGhlToken(sealed: string, providerId: string, locationId: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = key(env);
  const parts = SEALED.exec(sealed);
  if (!secret || !parts) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', secret, Buffer.from(parts[1], 'base64url'));
    decipher.setAAD(additionalData(providerId, locationId));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
