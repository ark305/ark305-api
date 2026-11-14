import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { getSupabaseConfig } from '../identity/supabase-config.js';
import { Coordinates, LocationFix, NearbyRow, StoredLocation, TrackingPort } from './tracking.port.js';

const COLUMNS = 'provider_id,latitude,longitude,accuracy_m,on_duty,recorded_at';
const MAX_LISTED = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function unavailable() {
  return new ServiceUnavailableException('Tracking storage unavailable');
}

function mapLocation(value: unknown): StoredLocation {
  if (!isRecord(value) || typeof value.provider_id !== 'string' || !finite(value.latitude) || !finite(value.longitude) ||
      !(value.accuracy_m === null || finite(value.accuracy_m)) || typeof value.on_duty !== 'boolean' ||
      typeof value.recorded_at !== 'string' || Number.isNaN(Date.parse(value.recorded_at))) throw unavailable();
  return { providerId: value.provider_id, latitude: value.latitude, longitude: value.longitude, accuracyM: value.accuracy_m,
    onDuty: value.on_duty, recordedAt: value.recorded_at };
}

function mapNearby(value: unknown): NearbyRow {
  if (!isRecord(value) || typeof value.provider_id !== 'string' || !finite(value.distance_km) || !Number.isInteger(value.age_seconds) ||
      !(value.latitude === null || finite(value.latitude)) || !(value.longitude === null || finite(value.longitude))) throw unavailable();
  return { providerId: value.provider_id, distanceKm: value.distance_km, ageSeconds: value.age_seconds as number,
    latitude: value.latitude, longitude: value.longitude };
}

@Injectable()
export class SupabaseTrackingAdapter extends TrackingPort {
  async isOperator(token: string, userId: string): Promise<boolean> {
    const rows = await this.request(token, 'GET', 'request_administrators', { select: 'user_id', user_id: `eq.${userId}`, limit: '2' });
    if (!Array.isArray(rows) || rows.length > 1) throw unavailable();
    if (rows.length === 0) return false;
    if (!isRecord(rows[0]) || rows[0].user_id !== userId) throw unavailable();
    return true;
  }

  async saveLocation(token: string, providerId: string, fix: LocationFix): Promise<StoredLocation> {
    const rows = await this.request(token, 'POST', 'provider_locations', { select: COLUMNS, on_conflict: 'provider_id' }, {
      provider_id: providerId, latitude: fix.latitude, longitude: fix.longitude, accuracy_m: fix.accuracyM, on_duty: fix.onDuty,
    }, 'resolution=merge-duplicates,return=representation');
    if (!Array.isArray(rows) || rows.length !== 1) throw unavailable();
    return mapLocation(rows[0]);
  }

  async nearby(token: string, origin: Coordinates, radiusKm: number): Promise<NearbyRow[]> {
    const rows = await this.request(token, 'POST', 'rpc/nearby_providers', {}, {
      origin_latitude: origin.latitude, origin_longitude: origin.longitude, radius_km: radiusKm,
    });
    if (!Array.isArray(rows)) throw unavailable();
    return rows.map(mapNearby);
  }

  async listLocations(token: string): Promise<StoredLocation[]> {
    const rows = await this.request(token, 'GET', 'provider_locations', { select: COLUMNS, order: 'recorded_at.desc,provider_id.asc', limit: String(MAX_LISTED) });
    if (!Array.isArray(rows) || rows.length > MAX_LISTED) throw unavailable();
    return rows.map(mapLocation);
  }

  private async request(token: string, method: 'GET' | 'POST', path: string, search: Record<string, string>, body?: unknown, prefer?: string): Promise<unknown> {
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
    // RLS rejects writes from callers without a provider profile; PostgREST reports that as 403.
    if (response.status === 403 && path === 'provider_locations') throw new ForbiddenException('Provider profile required');
    if (!response.ok) throw unavailable();
    try { return await response.json(); } catch { throw unavailable(); }
  }
}
