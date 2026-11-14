import { ForbiddenException, Injectable } from '@nestjs/common';
import { getSupabaseConfig } from '../identity/supabase-config.js';
import { ProviderService, ProviderServicesPort, SERVICE_CATEGORIES, ServiceFields, ServiceSearch } from './provider-services.port.js';
import { serviceUnavailable } from './provider-services.service.js';

const COLUMNS = 'id,provider_id,name,description,price_cents,currency,duration_minutes,category,active,created_at,updated_at';
const MAX_OWN = 200;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const timestamp = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));

function mapService(value: unknown): ProviderService {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.provider_id !== 'string' || typeof value.name !== 'string' ||
      typeof value.description !== 'string' || !Number.isSafeInteger(value.price_cents) || typeof value.currency !== 'string' ||
      !Number.isSafeInteger(value.duration_minutes) || typeof value.category !== 'string' ||
      !(SERVICE_CATEGORIES as readonly string[]).includes(value.category) || typeof value.active !== 'boolean' ||
      !timestamp(value.created_at) || !timestamp(value.updated_at)) throw serviceUnavailable();
  return {
    id: value.id, providerId: value.provider_id, name: value.name, description: value.description, priceCents: value.price_cents as number,
    currency: value.currency, durationMinutes: value.duration_minutes as number, category: value.category as ProviderService['category'],
    active: value.active, createdAt: value.created_at, updatedAt: value.updated_at,
  };
}

function columns(fields: Partial<ServiceFields>): Record<string, unknown> {
  const names: Record<keyof ServiceFields, string> = { name: 'name', description: 'description', priceCents: 'price_cents', currency: 'currency',
    durationMinutes: 'duration_minutes', category: 'category', active: 'active' };
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [names[key as keyof ServiceFields], value]));
}

function rowsOf(value: unknown, max: number): ProviderService[] {
  if (!Array.isArray(value) || value.length > max) throw serviceUnavailable();
  return value.map(mapService);
}

@Injectable()
export class SupabaseProviderServicesAdapter extends ProviderServicesPort {
  async create(token: string, providerId: string, fields: ServiceFields): Promise<ProviderService> {
    const rows = rowsOf(await this.request(token, 'POST', 'services', { select: COLUMNS }, { provider_id: providerId, ...columns(fields) }, 'return=representation'), 1);
    if (rows.length !== 1) throw serviceUnavailable();
    return rows[0];
  }

  async update(token: string, providerId: string, id: string, fields: Partial<ServiceFields>): Promise<ProviderService | null> {
    const rows = rowsOf(await this.request(token, 'PATCH', 'services', { select: COLUMNS, id: `eq.${id}`, provider_id: `eq.${providerId}` },
      columns(fields), 'return=representation'), 1);
    return rows[0] ?? null;
  }

  async findById(token: string, id: string): Promise<ProviderService | null> {
    return rowsOf(await this.request(token, 'GET', 'services', { select: COLUMNS, id: `eq.${id}`, limit: '2' }), 1)[0] ?? null;
  }

  async search(token: string, search: ServiceSearch): Promise<ProviderService[]> {
    return rowsOf(await this.request(token, 'POST', 'rpc/search_services', { select: COLUMNS }, {
      search_text: search.text ?? null, search_category: search.category ?? null, search_provider: search.providerId ?? null,
      result_limit: search.limit, result_offset: search.offset,
    }), search.limit);
  }

  async listOwn(token: string, providerId: string): Promise<ProviderService[]> {
    return rowsOf(await this.request(token, 'GET', 'services', { select: COLUMNS, provider_id: `eq.${providerId}`,
      order: 'updated_at.desc,id.asc', limit: String(MAX_OWN) }), MAX_OWN);
  }

  private async request(token: string, method: 'GET' | 'POST' | 'PATCH', path: string, search: Record<string, string>, body?: unknown, prefer?: string): Promise<unknown> {
    const config = getSupabaseConfig();
    if (!config) throw serviceUnavailable();
    const url = new URL(`/rest/v1/${path}`, config.url);
    for (const [key, value] of Object.entries(search)) url.searchParams.set(key, value);
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          apikey: config.publishableKey,
          Authorization: `Bearer ${token}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(prefer ? { Prefer: prefer } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(5000), redirect: 'error', cache: 'no-store',
      });
    } catch {
      throw serviceUnavailable();
    }
    // RLS rejects writes from callers without an approved provider profile; PostgREST reports that as 403.
    if (response.status === 403 && path === 'services' && method !== 'GET') throw new ForbiddenException('Provider profile required');
    if (!response.ok) throw serviceUnavailable();
    try { return await response.json(); } catch { throw serviceUnavailable(); }
  }
}
