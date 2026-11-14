export type Coordinates = { latitude: number; longitude: number };
export type LocationFix = Coordinates & { accuracyM: number | null; onDuty: boolean };
export type StoredLocation = LocationFix & { providerId: string; recordedAt: string };
export type NearbyRow = { providerId: string; distanceKm: number; ageSeconds: number; latitude: number | null; longitude: number | null };

export abstract class TrackingPort {
  abstract isOperator(token: string, userId: string): Promise<boolean>;
  abstract saveLocation(token: string, providerId: string, fix: LocationFix): Promise<StoredLocation>;
  abstract nearby(token: string, origin: Coordinates, radiusKm: number): Promise<NearbyRow[]>;
  abstract listLocations(token: string): Promise<StoredLocation[]>;
}
