import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { getSupabaseConfig } from '../identity/supabase-config.js';

// Operators are the existing request administrators; the RLS policy only lets a user read their own row.
@Injectable()
export class GhlAccess {
  async requireOperator(token: string, userId: string): Promise<void> {
    const config = getSupabaseConfig();
    if (!config) throw new ServiceUnavailableException('Operator check unavailable');
    const url = new URL('/rest/v1/request_administrators', config.url);
    url.searchParams.set('select', 'user_id');
    url.searchParams.set('user_id', `eq.${userId}`);
    url.searchParams.set('limit', '2');
    let rows: unknown;
    try {
      const response = await fetch(url, {
        headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000), redirect: 'error', cache: 'no-store',
      });
      if (!response.ok) throw new Error();
      rows = await response.json();
    } catch {
      throw new ServiceUnavailableException('Operator check unavailable');
    }
    if (!Array.isArray(rows) || rows.length > 1) throw new ServiceUnavailableException('Operator check unavailable');
    const row = rows[0] as { user_id?: unknown } | undefined;
    if (!row || row.user_id !== userId) throw new ForbiddenException('GoHighLevel operator required');
  }
}
