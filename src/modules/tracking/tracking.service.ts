import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Coordinates, LocationFix, StoredLocation, TrackingPort } from './tracking.port.js';

export const STALE_AFTER_MINUTES = 15;
export const DEFAULT_RADIUS_KM = 5;
export const MAX_RADIUS_KM = 50;
export const MAX_NEARBY_RESULTS = 50;
const STALE_AFTER_SECONDS = STALE_AFTER_MINUTES * 60;
const DECIMAL = /^-?\d{1,3}(\.\d{1,12})?$/;

export type NearbyQuery = Coordinates & { radiusKm: number };
export type NearbyProvider = { providerId: string; distanceKm: number; ageSeconds: number; latitude?: number; longitude?: number };
export type TrackedLocation = StoredLocation & { stale: boolean; available: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(code: string) {
  return new BadRequestException({ message: 'Invalid tracking input', code });
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function decimal(value: unknown): number | undefined {
  return typeof value === 'string' && DECIMAL.test(value) ? Number(value) : undefined;
}

export function parseLocationFix(body: unknown): LocationFix {
  if (!isRecord(body) || Object.keys(body).some(key => !['latitude', 'longitude', 'accuracy', 'onDuty'].includes(key))) throw invalid('location');
  if (!inRange(body.latitude, -90, 90)) throw invalid('latitude');
  if (!inRange(body.longitude, -180, 180)) throw invalid('longitude');
  if (body.accuracy !== undefined && body.accuracy !== null && !inRange(body.accuracy, 0, 10_000)) throw invalid('accuracy');
  if (body.onDuty !== undefined && typeof body.onDuty !== 'boolean') throw invalid('onDuty');
  return { latitude: body.latitude, longitude: body.longitude, accuracyM: (body.accuracy as number | null | undefined) ?? null, onDuty: body.onDuty ?? true };
}

export function parseNearbyQuery(query: unknown): NearbyQuery {
  if (!isRecord(query) || Object.keys(query).some(key => !['latitude', 'longitude', 'radiusKm'].includes(key))) throw invalid('nearby');
  const latitude = decimal(query.latitude); const longitude = decimal(query.longitude);
  if (!inRange(latitude, -90, 90)) throw invalid('latitude');
  if (!inRange(longitude, -180, 180)) throw invalid('longitude');
  const radiusKm = query.radiusKm === undefined ? DEFAULT_RADIUS_KM : decimal(query.radiusKm);
  if (!inRange(radiusKm, 0, MAX_RADIUS_KM) || radiusKm === 0) throw invalid('radiusKm');
  return { latitude, longitude, radiusKm };
}

@Injectable()
export class TrackingService {
  now: () => number = Date.now;

  constructor(private readonly port: TrackingPort) {}

  async shareLocation(token: string, providerId: string, body: unknown): Promise<StoredLocation> {
    const fix = parseLocationFix(body);
    const saved = await this.port.saveLocation(token, providerId, fix);
    if (saved.providerId !== providerId) throw new ServiceUnavailableException('Tracking storage unavailable');
    return saved;
  }

  async nearby(token: string, viewerId: string, query: unknown) {
    const search = parseNearbyQuery(query);
    const [operator, rows] = await Promise.all([this.port.isOperator(token, viewerId), this.port.nearby(token, search, search.radiusKm)]);
    const items: NearbyProvider[] = rows
      .filter(row => row.ageSeconds >= 0 && row.ageSeconds <= STALE_AFTER_SECONDS && row.distanceKm >= 0 && row.distanceKm <= search.radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm || a.providerId.localeCompare(b.providerId))
      .slice(0, MAX_NEARBY_RESULTS)
      .map(({ providerId, distanceKm, ageSeconds, latitude, longitude }) => operator && latitude !== null && longitude !== null
        ? { providerId, distanceKm, ageSeconds, latitude, longitude }
        : { providerId, distanceKm: Math.round(distanceKm * 10) / 10, ageSeconds });
    return { origin: { latitude: search.latitude, longitude: search.longitude }, radiusKm: search.radiusKm, staleAfterMinutes: STALE_AFTER_MINUTES, items };
  }

  async listLocations(token: string, viewerId: string): Promise<{ staleAfterMinutes: number; items: TrackedLocation[] }> {
    if (!await this.port.isOperator(token, viewerId)) throw new ForbiddenException('Tracking operator required');
    const cutoff = this.now() - STALE_AFTER_SECONDS * 1000;
    const items = (await this.port.listLocations(token)).map(row => {
      const stale = !(Date.parse(row.recordedAt) >= cutoff);
      return { ...row, stale, available: row.onDuty && !stale };
    });
    return { staleAfterMinutes: STALE_AFTER_MINUTES, items };
  }
}
