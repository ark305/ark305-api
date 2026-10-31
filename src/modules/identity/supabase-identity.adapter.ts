import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { IdentityPort, Principal } from './identity.port';

@Injectable()
export class SupabaseIdentityAdapter extends IdentityPort {
  async verify(token: string): Promise<Principal | null> {
    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!base || !key) throw new ServiceUnavailableException('Identity service unavailable');
    try {
      const url = new URL(base);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
          url.username || url.password || url.search || url.hash || url.pathname !== '/') {
        throw new Error('Invalid identity origin');
      }
      const response = await fetch(new URL('/auth/v1/user', url), {
        headers: { apikey: key, Authorization: `Bearer ${token}` },
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
