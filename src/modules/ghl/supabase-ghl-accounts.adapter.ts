import { ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { getSupabaseConfig } from '../identity/supabase-config.js';
import { GhlAccountStatus, GhlAccountWrite, GhlAccountsPort, GhlStoredCredentials } from './ghl-accounts.port.js';

// token_ciphertext is not selectable from the table; it is only read through the ghl_provider_credentials RPC.
const STATUS_COLUMNS = 'provider_id,location_id,pipeline_id,pipeline_stage_id,connected_at,updated_at';
const MAX_LISTED = 500;

const unavailable = () => new ServiceUnavailableException('GoHighLevel account storage unavailable');
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const nullableString = (value: unknown) => value === null || typeof value === 'string';

function mapStatus(value: unknown): GhlAccountStatus {
  if (!isRecord(value) || typeof value.provider_id !== 'string' || typeof value.location_id !== 'string' ||
      !nullableString(value.pipeline_id) || !nullableString(value.pipeline_stage_id) ||
      typeof value.connected_at !== 'string' || typeof value.updated_at !== 'string') throw unavailable();
  return { providerId: value.provider_id, connected: true, locationId: value.location_id, pipelineId: value.pipeline_id as string | null,
    pipelineStageId: value.pipeline_stage_id as string | null, connectedAt: value.connected_at, updatedAt: value.updated_at };
}

@Injectable()
export class SupabaseGhlAccountsAdapter extends GhlAccountsPort {
  async profileKind(token: string, userId: string): Promise<string | null> {
    const rows = await this.request(token, 'GET', 'profiles', { select: 'id,kind', id: `eq.${userId}`, limit: '2' });
    if (!Array.isArray(rows) || rows.length > 1) throw unavailable();
    if (rows.length === 0) return null;
    if (!isRecord(rows[0]) || rows[0].id !== userId || typeof rows[0].kind !== 'string') throw unavailable();
    return rows[0].kind;
  }

  async credentials(token: string, providerId: string): Promise<GhlStoredCredentials | null> {
    const rows = await this.request(token, 'POST', 'rpc/ghl_provider_credentials', {}, { provider: providerId });
    if (!Array.isArray(rows) || rows.length > 1) throw unavailable();
    if (rows.length === 0) return null;
    const row = rows[0];
    if (!isRecord(row) || typeof row.location_id !== 'string' || typeof row.token_ciphertext !== 'string' ||
        !nullableString(row.pipeline_id) || !nullableString(row.pipeline_stage_id)) throw unavailable();
    return { locationId: row.location_id, pipelineId: row.pipeline_id as string | null,
      pipelineStageId: row.pipeline_stage_id as string | null, tokenCiphertext: row.token_ciphertext };
  }

  // No role may read token_ciphertext, and an upsert reads EXCLUDED.token_ciphertext, so reconnecting updates the row
  // and a first connection inserts it; a concurrent first insert that loses the race retries as an update.
  async save(token: string, account: GhlAccountWrite): Promise<GhlAccountStatus> {
    const values = { location_id: account.locationId, pipeline_id: account.pipelineId,
      pipeline_stage_id: account.pipelineStageId, token_ciphertext: account.tokenCiphertext };
    for (let attempt = 0; attempt < 2; attempt++) {
      const updated = await this.request(token, 'PATCH', 'ghl_provider_accounts', { select: STATUS_COLUMNS, provider_id: `eq.${account.providerId}` },
        values, 'return=representation');
      if (!Array.isArray(updated) || updated.length > 1) throw unavailable();
      if (updated.length === 1) return this.owned(updated[0], account.providerId);
      try {
        const inserted = await this.request(token, 'POST', 'ghl_provider_accounts', { select: STATUS_COLUMNS },
          { provider_id: account.providerId, ...values }, 'return=representation');
        if (!Array.isArray(inserted) || inserted.length !== 1) throw unavailable();
        return this.owned(inserted[0], account.providerId);
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
      }
    }
    throw unavailable();
  }

  private owned(row: unknown, providerId: string): GhlAccountStatus {
    const status = mapStatus(row);
    if (status.providerId !== providerId) throw unavailable();
    return status;
  }

  async remove(token: string, providerId: string): Promise<void> {
    await this.request(token, 'DELETE', 'ghl_provider_accounts', { provider_id: `eq.${providerId}` }, undefined, 'return=minimal');
  }

  async status(token: string, providerId: string): Promise<GhlAccountStatus | null> {
    const rows = await this.request(token, 'GET', 'ghl_provider_accounts', { select: STATUS_COLUMNS, provider_id: `eq.${providerId}`, limit: '2' });
    if (!Array.isArray(rows) || rows.length > 1) throw unavailable();
    return rows.length ? mapStatus(rows[0]) : null;
  }

  async list(token: string): Promise<GhlAccountStatus[]> {
    const rows = await this.request(token, 'GET', 'ghl_provider_accounts', { select: STATUS_COLUMNS, order: 'updated_at.desc,provider_id.asc', limit: String(MAX_LISTED) });
    if (!Array.isArray(rows) || rows.length > MAX_LISTED) throw unavailable();
    return rows.map(mapStatus);
  }

  private async request(token: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, search: Record<string, string>, body?: unknown, prefer?: string): Promise<unknown> {
    const config = getSupabaseConfig();
    if (!config) throw unavailable();
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
      throw unavailable();
    }
    // RLS rejects connections from callers without an approved provider profile; PostgREST reports that as 403.
    if (response.status === 403 && path === 'ghl_provider_accounts') throw new ForbiddenException('Provider profile required');
    if (response.status === 409 && method === 'POST' && path === 'ghl_provider_accounts') throw new ConflictException();
    if (!response.ok) throw unavailable();
    if (response.status === 204) return null;
    try { return await response.json(); } catch { throw unavailable(); }
  }
}
