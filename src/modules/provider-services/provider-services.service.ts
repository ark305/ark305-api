import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Page, ProviderService, ProviderServicesPort, SERVICE_CATEGORIES, ServiceCategory, ServiceFields, ServiceSearch } from './provider-services.port.js';

export const LIMITS = { name: 120, description: 2000, priceCents: 100_000_000, durationMinutes: 43_200, query: 100, pageSize: 100, offset: 10_000 } as const;
const DEFAULT_PAGE_SIZE = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY = /^[A-Z]{3}$/;
const INTEGER = /^(0|[1-9]\d{0,5})$/;
// Control characters other than tab/newline (descriptions may span lines).
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/;
const LINE_BREAK = /[\t\n\r]/;
const FIELDS = ['name', 'description', 'priceCents', 'currency', 'durationMinutes', 'category', 'active'];
const QUERY_KEYS = ['q', 'category', 'providerId', 'limit', 'offset'];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const invalid = (code: string) => new BadRequestException({ message: 'Invalid service input', code });
const integerIn = (value: unknown, min: number, max: number): value is number => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
export const serviceUnavailable = () => new ServiceUnavailableException('Catalog storage unavailable');

function text(value: unknown, code: string, min: number, max: number, multiline: boolean): string {
  if (typeof value !== 'string') throw invalid(code);
  const trimmed = value.trim().normalize('NFC');
  if (trimmed.length < min || trimmed.length > max || CONTROL.test(trimmed) || (!multiline && LINE_BREAK.test(trimmed))) throw invalid(code);
  return trimmed;
}

function category(value: unknown): ServiceCategory {
  if (typeof value !== 'string' || !(SERVICE_CATEGORIES as readonly string[]).includes(value)) throw invalid('category');
  return value as ServiceCategory;
}

export function parseServiceId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new BadRequestException('Invalid service ID');
  return value.toLowerCase();
}

/** `partial` for updates: any subset of fields, at least one. Owner and timestamps are never accepted from the body. */
export function parseServiceFields(body: unknown, partial: false): ServiceFields;
export function parseServiceFields(body: unknown, partial: true): Partial<ServiceFields>;
export function parseServiceFields(body: unknown, partial: boolean): Partial<ServiceFields> {
  if (!isRecord(body) || Object.keys(body).some(key => !FIELDS.includes(key))) throw invalid('service');
  if (partial && Object.keys(body).length === 0) throw invalid('service');
  const has = (key: string) => Object.hasOwn(body, key);
  const fields: Partial<ServiceFields> = {};
  if (has('name') || !partial) fields.name = text(body.name, 'name', 1, LIMITS.name, false);
  if (has('description')) fields.description = text(body.description, 'description', 0, LIMITS.description, true);
  else if (!partial) fields.description = '';
  if (has('priceCents') || !partial) {
    if (!integerIn(body.priceCents, 0, LIMITS.priceCents)) throw invalid('priceCents');
    fields.priceCents = body.priceCents;
  }
  if (has('currency')) {
    if (typeof body.currency !== 'string' || !CURRENCY.test(body.currency)) throw invalid('currency');
    fields.currency = body.currency;
  } else if (!partial) fields.currency = 'USD';
  if (has('durationMinutes') || !partial) {
    if (!integerIn(body.durationMinutes, 1, LIMITS.durationMinutes)) throw invalid('durationMinutes');
    fields.durationMinutes = body.durationMinutes;
  }
  if (has('category') || !partial) fields.category = category(body.category);
  if (has('active')) {
    if (typeof body.active !== 'boolean') throw invalid('active');
    fields.active = body.active;
  } else if (!partial) fields.active = true;
  return fields;
}

export function parseServiceSearch(query: unknown): ServiceSearch {
  if (!isRecord(query) || Object.keys(query).some(key => !QUERY_KEYS.includes(key))) throw invalid('search');
  const search: ServiceSearch = { limit: DEFAULT_PAGE_SIZE, offset: 0 };
  if (query.q !== undefined) {
    const value = text(query.q, 'q', 0, LIMITS.query, false);
    if (value) search.text = value;
  }
  if (query.category !== undefined) search.category = category(query.category);
  if (query.providerId !== undefined) {
    if (typeof query.providerId !== 'string' || !UUID.test(query.providerId)) throw invalid('providerId');
    search.providerId = query.providerId.toLowerCase();
  }
  for (const [key, min, max] of [['limit', 1, LIMITS.pageSize], ['offset', 0, LIMITS.offset]] as const) {
    const value = query[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !INTEGER.test(value) || Number(value) < min || Number(value) > max) throw invalid(key);
    search[key] = Number(value);
  }
  return search;
}

export function parseOwnPage(query: unknown): Page {
  if (!isRecord(query) || Object.keys(query).some(key => key !== 'limit' && key !== 'offset')) throw invalid('page');
  const { limit, offset } = parseServiceSearch(query);
  return { limit, offset };
}

@Injectable()
export class ProviderServicesService {
  constructor(private readonly port: ProviderServicesPort) {}

  async create(token: string, providerId: string, body: unknown): Promise<ProviderService> {
    const fields = parseServiceFields(body, false);
    return this.owned(await this.port.create(token, providerId, fields), providerId);
  }

  async update(token: string, providerId: string, id: unknown, body: unknown): Promise<ProviderService> {
    const serviceId = parseServiceId(id);
    const fields = parseServiceFields(body, true);
    const updated = await this.port.update(token, providerId, serviceId, fields);
    if (!updated) throw new NotFoundException('Service not found');
    return this.owned(updated, providerId, serviceId);
  }

  async deactivate(token: string, providerId: string, id: unknown): Promise<ProviderService> {
    const serviceId = parseServiceId(id);
    const updated = await this.port.update(token, providerId, serviceId, { active: false });
    if (!updated) throw new NotFoundException('Service not found');
    return this.owned(updated, providerId, serviceId);
  }

  async search(token: string, query: unknown): Promise<{ items: ProviderService[]; limit: number; offset: number }> {
    const search = parseServiceSearch(query);
    const rows = await this.port.search(token, search);
    if (rows.length > search.limit) throw serviceUnavailable();
    // Storage already filters; this keeps inactive or mismatched rows out even if it did not.
    const items = rows.filter(row => row.active && (!search.category || row.category === search.category) &&
      (!search.providerId || row.providerId === search.providerId));
    return { items, limit: search.limit, offset: search.offset };
  }

  async listOwn(token: string, providerId: string, query: unknown): Promise<{ items: ProviderService[]; limit: number; offset: number }> {
    const page = parseOwnPage(query);
    const rows = await this.port.listOwn(token, providerId, page);
    if (rows.length > page.limit || rows.some(row => row.providerId !== providerId)) throw serviceUnavailable();
    return { items: rows, ...page };
  }

  /** Active services for everyone; an inactive one only for its own provider. */
  async findById(token: string, viewerId: string, id: unknown): Promise<ProviderService> {
    const serviceId = parseServiceId(id);
    const row = await this.port.findById(token, serviceId);
    if (row && row.id !== serviceId) throw serviceUnavailable();
    if (!row || (!row.active && row.providerId !== viewerId)) throw new NotFoundException('Service not found');
    return row;
  }

  private owned(row: ProviderService, providerId: string, id?: string): ProviderService {
    if (row.providerId !== providerId || (id && row.id !== id)) throw serviceUnavailable();
    return row;
  }
}
