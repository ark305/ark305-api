import { HttpException, Injectable } from '@nestjs/common';
import { getSupabaseConfig } from '../identity/supabase-config';

@Injectable()
export class AiContextAdapter {
  async load(token: string, userId: string, locale: 'es' | 'en'): Promise<string> {
    const config = getSupabaseConfig();
    if (!config) throw new HttpException({ error: 'auth' }, 401);
    const headers = { apikey: config.publishableKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    try {
      const quota = await fetch(new URL('/rest/v1/rpc/bump_ai', config.url), {
        method: 'POST', headers, body: JSON.stringify({ lim: parseInt(process.env.AI_DAILY_LIMIT || '60', 10) }),
        signal: AbortSignal.timeout(5000), redirect: 'error', cache: 'no-store',
      });
      // Preserve the generic conversation contract; structured tasks will fail closed.
      if (quota.ok && await quota.json() === false) throw new HttpException({ error: 'rate_limited' }, 429);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ error: 'quota_unavailable' }, 503);
    }
    try {
      const url = new URL('/rest/v1/profiles', config.url);
      url.searchParams.set('select', 'experience');
      url.searchParams.set('id', `eq.${userId}`);
      url.searchParams.set('limit', '1');
      const profile = await fetch(url, { headers, signal: AbortSignal.timeout(5000), redirect: 'error', cache: 'no-store' });
      const rows: unknown = profile.ok ? await profile.json() : null;
      const mode = Array.isArray(rows) ? rows[0]?.experience : null;
      if (mode === 'lifestyle' || mode === 'business' || mode === 'both') {
        return locale === 'en' ? ` The user is in ${mode} mode.` : ` El usuario está en modo: ${mode}.`;
      }
    } catch { /* Profile context is optional, unlike authenticated identity. */ }
    return '';
  }
}
