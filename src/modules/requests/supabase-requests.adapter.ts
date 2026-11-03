import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { getSupabaseConfig } from '../identity/supabase-config';
import { CreateServiceRequest, RequestsPort, ServiceRequest } from './requests.port';

const COLUMNS = 'id,requester_id,service_id,requested_date,guests,preferences,status,created_at';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function mapRow(value: unknown, ownerId: string): ServiceRequest | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !UUID.test(value.id) ||
      value.requester_id !== ownerId || !UUID.test(ownerId) ||
      typeof value.service_id !== 'string' || !isDate(value.requested_date) ||
      !Number.isInteger(value.guests) || Number(value.guests) < 1 || Number(value.guests) > 20 ||
      typeof value.preferences !== 'string' || value.preferences.length > 2000 ||
      (value.status !== 'received' && value.status !== 'in_progress' && value.status !== 'closed' && value.status !== 'cancelled') || typeof value.created_at !== 'string' ||
      !Number.isFinite(Date.parse(value.created_at))) return null;

  return {
    id: value.id,
    serviceId: value.service_id,
    requestedDate: value.requested_date,
    guests: Number(value.guests),
    preferences: value.preferences,
    status: value.status,
    createdAt: value.created_at,
  };
}

@Injectable()
export class SupabaseRequestsAdapter extends RequestsPort {
  async create(token: string, ownerId: string, request: CreateServiceRequest): Promise<ServiceRequest> {
    const rows = await this.query(token, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        service_id: request.serviceId,
        requested_date: request.requestedDate,
        guests: request.guests,
        preferences: request.preferences,
      }),
    });
    const row = Array.isArray(rows) && rows.length === 1 ? mapRow(rows[0], ownerId) : null;
    if (!row || row.status !== 'received') throw new ServiceUnavailableException('Request storage unavailable');
    return row;
  }

  async list(token: string, ownerId: string): Promise<ServiceRequest[]> {
    const rows = await this.query(token, {
      method: 'GET',
      search: {
        requester_id: `eq.${ownerId}`,
        order: 'created_at.desc,id.desc',
        limit: '50',
      },
    });
    if (!Array.isArray(rows)) throw new ServiceUnavailableException('Request storage unavailable');
    const mapped = rows.map((row) => mapRow(row, ownerId));
    if (mapped.some((row) => row === null)) throw new ServiceUnavailableException('Request storage unavailable');
    return mapped as ServiceRequest[];
  }

  async findById(token: string, ownerId: string, id: string): Promise<ServiceRequest | undefined> {
    const rows = await this.query(token, {
      method: 'GET',
      search: { id: `eq.${id}`, requester_id: `eq.${ownerId}`, limit: '1' },
    });
    if (!Array.isArray(rows) || rows.length > 1) throw new ServiceUnavailableException('Request storage unavailable');
    if (rows.length === 0) return undefined;
    const row = mapRow(rows[0], ownerId);
    if (!row) throw new ServiceUnavailableException('Request storage unavailable');
    return row;
  }

  private async query(
    token: string,
    options: { method: 'GET' | 'POST'; search?: Record<string, string>; headers?: Record<string, string>; body?: string },
  ): Promise<unknown> {
    const config = getSupabaseConfig();
    if (!config) throw new ServiceUnavailableException('Request storage unavailable');
    const url = new URL('/rest/v1/service_requests', config.url);
    url.searchParams.set('select', COLUMNS);
    for (const [key, value] of Object.entries(options.search ?? {})) url.searchParams.set(key, value);

    try {
      const response = await fetch(url, {
        method: options.method,
        headers: {
          apikey: config.publishableKey,
          Authorization: `Bearer ${token}`,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers,
        },
        ...(options.body ? { body: options.body } : {}),
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Request storage unavailable');
      return await response.json();
    } catch {
      throw new ServiceUnavailableException('Request storage unavailable');
    }
  }
}
