import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { CatalogPort } from '../catalog/catalog.port.js';
import { complementIds, DEMO_PRICES } from '../ai/catalog-tools.js';
import { findService } from '../ai/service-catalog.js';
import { getSupabaseConfig } from '../identity/supabase-config.js';
import { RequestsPort, ServiceRequest } from './requests.port.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unavailable = () => new ServiceUnavailableException('Complement storage unavailable; acceptance is not confirmed');

@Injectable()
export class RequestAddonsService {
  constructor(private readonly requests: RequestsPort, private readonly catalog: CatalogPort) {}

  private async parent(token: string, owner: string, id: string) {
    if (!UUID.test(id)) throw new BadRequestException('Invalid request ID');
    const parent = await this.requests.findById(token, owner, id.toLowerCase());
    if (!parent || parent.id !== id.toLowerCase()) throw new NotFoundException('Service request not found');
    return parent;
  }

  private async query(token: string, id: string, serviceId?: string): Promise<unknown> {
    const config = getSupabaseConfig();
    if (!config) throw unavailable();
    const url = new URL('/rest/v1/service_request_addons', config.url);
    url.searchParams.set('select', 'id,request_id,service_id,qty,accepted_at');
    if (serviceId) url.searchParams.set('on_conflict', 'request_id,service_id');
    else { url.searchParams.set('request_id', `eq.${id}`); url.searchParams.set('order', 'accepted_at.asc,id.asc'); url.searchParams.set('limit', '20'); }
    try {
      const response = await fetch(url, { method: serviceId ? 'POST' : 'GET', headers: {
        apikey: config.publishableKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
        ...(serviceId ? { Prefer: 'resolution=ignore-duplicates,return=representation' } : {}),
      }, ...(serviceId ? { body: JSON.stringify({ request_id: id, service_id: serviceId }) } : {}), redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (response.status === 409) throw new ConflictException('Request changed; refresh before retrying');
      if (!response.ok) throw unavailable();
      return await response.json();
    } catch (error) { if (error instanceof ConflictException) throw error; throw unavailable(); }
  }

  private async read(token: string, parent: ServiceRequest) {
    const rows = await this.query(token, parent.id);
    if (!Array.isArray(rows) || rows.length > 20) throw unavailable();
    const seen = new Set<string>();
    return Promise.all(rows.map(async row => {
      if (!row || typeof row !== 'object' || !UUID.test(row.id) || row.request_id !== parent.id || row.qty !== 1 ||
          !complementIds(parent.serviceId).includes(row.service_id) || seen.has(row.service_id) ||
          typeof row.accepted_at !== 'string' || !Number.isFinite(Date.parse(row.accepted_at))) throw unavailable();
      seen.add(row.service_id);
      const service = await this.catalog.findById(row.service_id);
      const unit = findService(row.service_id)?.unit;
      if (!service || !unit || !Number.isFinite(DEMO_PRICES[row.service_id])) throw unavailable();
      return { id: row.id as string, requestId: parent.id, serviceId: service.id, qty: 1, acceptedAt: row.accepted_at as string,
        estimate: { amount: DEMO_PRICES[service.id] * (unit === 'p' ? parent.guests : 1), currency: 'USD', source: 'demo' }, availability: 'unverified', bookable: false };
    }));
  }

  async list(token: string, owner: string, id: string) { return { items: await this.read(token, await this.parent(token, owner, id)) }; }

  async accept(token: string, owner: string, id: string, serviceId: string) {
    const parent = await this.parent(token, owner, id);
    if (!complementIds(parent.serviceId).includes(serviceId) || !await this.catalog.findById(serviceId)) throw new BadRequestException('Invalid complement service ID');
    if (!['received', 'in_progress'].includes(parent.status)) throw new ConflictException('Request is no longer active');
    const result = await this.query(token, parent.id, serviceId);
    if (!Array.isArray(result)) throw unavailable();
    const accepted = (await this.read(token, parent)).find(item => item.serviceId === serviceId);
    if (!accepted) throw unavailable();
    return accepted;
  }
}
