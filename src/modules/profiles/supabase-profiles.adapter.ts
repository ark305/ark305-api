import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { getSupabaseConfig } from '../identity/supabase-config';
import { ProfileInput, ProfileRecord, ProfilesPort, ServiceInput, ServiceRecord } from './profiles.port';

const PRIVATE_COLUMNS = 'id,handle,name,kind,role,area,tagline,photo_url,banner_url,gallery,instagram,tiktok,facebook,bio_link,shared,experience,taste,diagnosis';
const PUBLIC_COLUMNS = 'id,handle,name,kind,role,area,tagline,photo_url,banner_url,gallery,instagram,tiktok,facebook,bio_link,shared';
const SERVICE_COLUMNS = 'id,owner,title,kicker,detail,price,action,photo_url,position';

@Injectable()
export class SupabaseProfilesAdapter extends ProfilesPort {
  findOwn(token: string, ownerId: string) {
    return this.single<ProfileRecord>('profiles', token, PRIVATE_COLUMNS, { id: `eq.${ownerId}`, limit: '1' });
  }

  findPublic(token: string, handle: string) {
    return this.single<ProfileRecord>('profiles', token, PUBLIC_COLUMNS, { handle: `eq.${handle}`, limit: '1' });
  }

  recent(token: string, limit: number) {
    return this.list<ProfileRecord>('profiles', token, PUBLIC_COLUMNS, { order: 'created_at.desc', limit: String(limit) });
  }

  async handleTaken(token: string, handle: string, excludeId?: string) {
    const rows = await this.list<ProfileRecord>('profiles', token, 'id', { handle: `eq.${handle}`, limit: '2' });
    return rows.some((row) => row.id !== excludeId);
  }

  async createProfile(token: string, ownerId: string, value: ProfileInput) {
    const rows = await this.write<ProfileRecord>('profiles', token, 'POST', value, {}, PRIVATE_COLUMNS);
    return rows[0]?.id === ownerId ? rows[0] : null;
  }

  async updateProfile(token: string, ownerId: string, value: ProfileInput) {
    const rows = await this.write<ProfileRecord>('profiles', token, 'PATCH', value, { id: `eq.${ownerId}` }, PRIVATE_COLUMNS);
    return rows[0]?.id === ownerId ? rows[0] : null;
  }

  listServices(token: string, ownerId: string) {
    return this.list<ServiceRecord>('services', token, SERVICE_COLUMNS, { owner: `eq.${ownerId}`, order: 'position.asc' });
  }

  async saveService(token: string, ownerId: string, id: string | undefined, value: ServiceInput) {
    const rows = id
      ? await this.write<ServiceRecord>('services', token, 'PATCH', value, { id: `eq.${id}`, owner: `eq.${ownerId}` }, SERVICE_COLUMNS)
      : await this.write<ServiceRecord>('services', token, 'POST', value, {}, SERVICE_COLUMNS);
    return rows[0]?.owner === ownerId ? rows[0] : null;
  }

  async deleteService(token: string, ownerId: string, id: string) {
    await this.query('services', token, 'DELETE', { id: `eq.${id}`, owner: `eq.${ownerId}` });
  }

  async updateOwn(token: string, ownerId: string, value: ProfileInput) {
    const rows = await this.write<ProfileRecord>('profiles', token, 'PATCH', value, { id: `eq.${ownerId}` }, 'id');
    return rows[0]?.id === ownerId;
  }

  private async single<T>(table: string, token: string, columns: string, search: Record<string, string>): Promise<T | null> {
    const rows = await this.list<T>(table, token, columns, search);
    if (rows.length > 1) throw new ServiceUnavailableException('Profile storage unavailable');
    return rows[0] ?? null;
  }

  private list<T>(table: string, token: string, columns: string, search: Record<string, string>): Promise<T[]> {
    return this.query<T[]>(table, token, 'GET', search, undefined, columns);
  }

  private write<T>(table: string, token: string, method: 'POST' | 'PATCH', body: unknown, search: Record<string, string>, columns: string): Promise<T[]> {
    return this.query<T[]>(table, token, method, search, body, columns);
  }

  private async query<T>(table: string, token: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', search: Record<string, string>, body?: unknown, columns?: string): Promise<T> {
    const config = getSupabaseConfig();
    if (!config) throw new ServiceUnavailableException('Profile storage unavailable');
    const url = new URL(`/rest/v1/${table}`, config.url);
    if (columns) url.searchParams.set('select', columns);
    for (const [key, value] of Object.entries(search)) url.searchParams.set(key, value);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          apikey: config.publishableKey,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(body !== undefined || method === 'DELETE' ? { Prefer: 'return=representation' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(5000), redirect: 'error', cache: 'no-store',
      });
      if (!response.ok) throw new Error('Storage failure');
      if (response.status === 204) return [] as T;
      const value: unknown = await response.json();
      if (!Array.isArray(value)) throw new Error('Invalid storage response');
      return value as T;
    } catch {
      throw new ServiceUnavailableException('Profile storage unavailable');
    }
  }
}
