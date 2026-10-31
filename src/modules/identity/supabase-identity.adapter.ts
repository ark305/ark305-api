import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { IdentityPort, Principal } from './identity.port';
import { getSupabaseConfig } from './supabase-config';

@Injectable()
export class SupabaseIdentityAdapter extends IdentityPort {
  async verify(token: string): Promise<Principal | null> {
    const config = getSupabaseConfig();
    if (!config) throw new ServiceUnavailableException('Identity service unavailable');
    try {
      const response = await fetch(new URL('/auth/v1/user', config.url), {
        headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000), redirect: 'error', cache: 'no-store',
      });
      if (response.status === 401 || response.status === 403) return null;
      if (!response.ok) throw new Error('Identity provider unavailable');
      const user: unknown = await response.json();
      if (!user || typeof user !== 'object' || !('id' in user) || typeof user.id !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)) {
        throw new Error('Invalid identity response');
      }
      return { id: user.id };
    } catch {
      throw new ServiceUnavailableException('Identity service unavailable');
    }
  }
}
