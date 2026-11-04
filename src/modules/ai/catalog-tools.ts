import { BadRequestException } from '@nestjs/common';
import { CatalogPort } from '../catalog/catalog.port.js';
import { findService } from './service-catalog.js';

// Prototype estimates, never supplier quotes or live availability.
export const DEMO_PRICES: Record<string, number> = { suv:125, airport:180, heli:1400, yacht:700, catamaran:420, jetski:150, chef:125, brunch:65, bottles:95, restaurant:75, vipTable:250, turnover:145, villa:220, photographer:350, drone:480, reel:650, shoot:500, edit30:900 };
export function complementIds(serviceId: string): string[] {
  if (['yacht', 'catamaran'].includes(serviceId)) return ['chef', 'bottles', 'photographer'];
  if (['jetski', 'heli'].includes(serviceId)) return ['suv', 'photographer'];
  if (['restaurant', 'vipTable'].includes(serviceId)) return ['suv'];
  if (serviceId === 'villa') return ['chef', 'brunch'];
  return [];
}

export type ToolEvidence = { name: string; callId: string; arguments: Record<string, string>; serviceIds: string[]; source: 'demo'; availability: 'unverified' };
export function catalogTools(baseId?: string) {
  return [{ name: baseId ? 'get_complements' : 'search_catalog',
    description: baseId ? 'Read compatible DEMO complements for the specified catalog service. Not live availability.' : 'Search the stored DEMO catalog by a short service keyword, English category (water, transport, dining, nightlife, home, content), or all. No real availability.',
    input_schema: { type: 'object', additionalProperties: false,
      properties: baseId ? { serviceId: { type: 'string' } } : { query: { type: 'string', maxLength: 120 } },
      required: [baseId ? 'serviceId' : 'query'] } }];
}

export async function queryCatalog(catalog: CatalogPort, name: string, input: unknown, locale: 'es' | 'en', baseId?: string) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Invalid catalog tool arguments');
  const args = input as Record<string, unknown>;
  const field = baseId ? 'serviceId' : 'query';
  const value = args[field];
  if (name !== (baseId ? 'get_complements' : 'search_catalog') || Object.keys(args).length !== 1 ||
      typeof value !== 'string' || !value.trim() || value.length > 120 || (baseId && value !== baseId)) {
    throw new BadRequestException('Invalid catalog tool arguments');
  }
  const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const query = normalize(value.trim());
  const rows = (await catalog.list()).filter(row => baseId ? complementIds(baseId).includes(row.id) :
    query === 'all' || normalize(`${row.id} ${row.category} ${row.name.es} ${row.name.en} ${row.description.es} ${row.description.en}`).includes(query));
  return { source: 'demo' as const, availability: 'unverified' as const, bookable: false,
    services: rows.filter(row => findService(row.id)).map(row => ({ id: row.id, name: row.name[locale], description: row.description[locale],
      unit: findService(row.id)!.unit, pricing: row.pricing, estimate: { amount: DEMO_PRICES[row.id], currency: 'USD', source: 'demo' },
      source: row.source, bookable: row.bookable, availability: 'unverified' })) };
}
