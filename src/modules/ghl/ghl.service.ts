import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { GHL_ID, GhlConfig } from './ghl-config.js';
import { GHL_VERSION, GhlClient, ghlUpstream } from './ghl.client.js';

export type GhlContactInput = {
  firstName?: string; lastName?: string; email?: string; phone?: string;
  companyName?: string; timezone?: string; tags?: string[]; source?: string;
};
export type GhlContact = { id: string; email: string | null; phone: string | null; firstName: string | null; lastName: string | null; tags: string[] };
export type GhlServiceOrder = { contactId: string; name: string; monetaryValue?: number; serviceId?: string; requestId?: string };
export type GhlOpportunity = { id: string; name: string; contactId: string; pipelineId: string; pipelineStageId: string | null; status: string; monetaryValue: number | null };
export type GhlMessageInput = { contactId: string; channel: 'sms' | 'whatsapp'; message: string };
export type GhlMessage = { conversationId: string; messageId: string; status: string | null };
export type GhlCalendar = { id: string; name: string; description: string | null; isActive: boolean; slotDuration: number | null; slotDurationUnit: string | null };
export type GhlAvailability = { calendarId: string; timezone: string | null; days: { date: string; slots: string[] }[] };

const CONTACT_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'companyName', 'timezone', 'tags', 'source'] as const;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/;
const PHONE = /^\+[1-9]\d{6,14}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 31;
const CHANNEL = { sms: 'SMS', whatsapp: 'WhatsApp' } as const;

const invalid = (what: string) => new BadRequestException(`Invalid ${what}`);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const optionalString = (value: unknown) => (typeof value === 'string' ? value : null);

// Intl.supportedValuesOf('timeZone') omits valid aliases such as UTC, so ask the formatter and keep its canonical name.
function canonicalTimeZone(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_+\/-]{0,63}$/.test(value)) return null;
  try { return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone; } catch { return null; }
}

export function assertGhlId(value: unknown, what = 'ID'): asserts value is string {
  if (typeof value !== 'string' || !GHL_ID.test(value)) throw invalid(what);
}

function parseIsoDate(value: unknown, what: string): number {
  if (typeof value !== 'string' || !DATE.test(value)) throw invalid(what);
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw invalid(what);
  return time;
}

export function parseContactInput(body: unknown, partial: boolean): GhlContactInput {
  if (!isRecord(body) || Object.keys(body).some(key => !(CONTACT_FIELDS as readonly string[]).includes(key))) throw invalid('contact');
  const contact: GhlContactInput = {};
  for (const key of ['firstName', 'lastName', 'companyName', 'source'] as const) {
    if (body[key] === undefined) continue;
    if (!text(body[key], 120)) throw invalid('contact');
    contact[key] = (body[key] as string).trim();
  }
  if (body.email !== undefined) {
    if (typeof body.email !== 'string' || !EMAIL.test(body.email.trim())) throw invalid('contact');
    contact.email = body.email.trim().toLowerCase();
  }
  if (body.phone !== undefined) {
    const phone = typeof body.phone === 'string' ? body.phone.replace(/[\s().-]/g, '') : '';
    if (!PHONE.test(phone)) throw invalid('contact');
    contact.phone = phone;
  }
  if (body.timezone !== undefined) {
    const timezone = canonicalTimeZone(body.timezone);
    if (!timezone) throw invalid('contact');
    contact.timezone = timezone;
  }
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.length > 20 || body.tags.some(tag => !text(tag, 64))) throw invalid('contact');
    contact.tags = [...new Set((body.tags as string[]).map(tag => tag.trim()))];
  }
  if (partial ? Object.keys(contact).length === 0 : !contact.email && !contact.phone) throw invalid('contact');
  return contact;
}

export function parseServiceOrder(body: unknown): GhlServiceOrder {
  if (!isRecord(body) || Object.keys(body).some(key => !['contactId', 'name', 'monetaryValue', 'serviceId', 'requestId'].includes(key))) throw invalid('service order');
  assertGhlId(body.contactId, 'service order');
  if (!text(body.name, 200)) throw invalid('service order');
  if (body.monetaryValue !== undefined && (typeof body.monetaryValue !== 'number' || !Number.isFinite(body.monetaryValue) ||
      body.monetaryValue < 0 || body.monetaryValue > 10_000_000)) throw invalid('service order');
  for (const key of ['serviceId', 'requestId'] as const) {
    if (body[key] !== undefined && (typeof body[key] !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(body[key] as string))) throw invalid('service order');
  }
  return {
    contactId: body.contactId, name: (body.name as string).trim(),
    ...(body.monetaryValue !== undefined ? { monetaryValue: Math.round((body.monetaryValue as number) * 100) / 100 } : {}),
    ...(body.serviceId !== undefined ? { serviceId: body.serviceId as string } : {}),
    ...(body.requestId !== undefined ? { requestId: body.requestId as string } : {}),
  };
}

export function parseMessageInput(body: unknown): GhlMessageInput {
  if (!isRecord(body) || Object.keys(body).some(key => !['contactId', 'channel', 'message'].includes(key))) throw invalid('message');
  assertGhlId(body.contactId, 'message');
  if (body.channel !== 'sms' && body.channel !== 'whatsapp') throw invalid('message');
  if (!text(body.message, 1600)) throw invalid('message');
  return { contactId: body.contactId, channel: body.channel, message: body.message as string };
}

function mapContact(value: unknown): GhlContact {
  if (!isRecord(value) || typeof value.id !== 'string') throw ghlUpstream();
  return {
    id: value.id, email: optionalString(value.email), phone: optionalString(value.phone),
    firstName: optionalString(value.firstName), lastName: optionalString(value.lastName),
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === 'string') : [],
  };
}

@Injectable()
export class GhlService {
  constructor(private readonly client: GhlClient) {}

  // Every call runs against `account` (a connected provider's sub-account) or, by default, ARK's own account.
  async upsertContact(input: GhlContactInput, account: GhlConfig = this.client.config()): Promise<{ contact: GhlContact; created: boolean }> {
    const data = await this.client.request({
      method: 'POST', path: '/contacts/upsert', version: GHL_VERSION.contacts,
      body: { ...input, locationId: account.locationId, source: input.source ?? 'ARK305' },
    }, account);
    return { contact: mapContact(data.contact), created: data.new === true };
  }

  async updateContact(contactId: string, input: GhlContactInput, account?: GhlConfig): Promise<GhlContact> {
    assertGhlId(contactId, 'contact ID');
    const data = await this.client.request({
      method: 'PUT', path: `/contacts/${contactId}`, version: GHL_VERSION.contacts, body: { ...input },
    }, account ?? this.client.config());
    return mapContact(data.contact);
  }

  async createServiceOrder(order: GhlServiceOrder, account: GhlConfig = this.client.config()): Promise<GhlOpportunity> {
    const { locationId, pipelineId, pipelineStageId } = account;
    if (!pipelineId) throw new HttpException({ error: 'ghl_pipeline_not_configured' }, 503);
    const data = await this.client.request({
      method: 'POST', path: '/opportunities/', version: GHL_VERSION.opportunities,
      body: {
        locationId, pipelineId, ...(pipelineStageId ? { pipelineStageId } : {}),
        name: order.name, status: 'open', contactId: order.contactId,
        ...(order.monetaryValue !== undefined ? { monetaryValue: order.monetaryValue } : {}),
        source: ['ARK305', order.serviceId && `service:${order.serviceId}`, order.requestId && `request:${order.requestId}`].filter(Boolean).join(' '),
      },
    }, account);
    const opportunity = data.opportunity;
    if (!isRecord(opportunity) || typeof opportunity.id !== 'string') throw ghlUpstream();
    return {
      id: opportunity.id, name: typeof opportunity.name === 'string' ? opportunity.name : order.name,
      contactId: typeof opportunity.contactId === 'string' ? opportunity.contactId : order.contactId,
      pipelineId: typeof opportunity.pipelineId === 'string' ? opportunity.pipelineId : pipelineId,
      pipelineStageId: optionalString(opportunity.pipelineStageId) ?? pipelineStageId ?? null,
      status: typeof opportunity.status === 'string' ? opportunity.status : 'open',
      monetaryValue: typeof opportunity.monetaryValue === 'number' ? opportunity.monetaryValue : order.monetaryValue ?? null,
    };
  }

  async sendMessage(input: GhlMessageInput, account?: GhlConfig): Promise<GhlMessage> {
    const data = await this.client.request({
      method: 'POST', path: '/conversations/messages', version: GHL_VERSION.conversations,
      body: { type: CHANNEL[input.channel], contactId: input.contactId, message: input.message },
    }, account ?? this.client.config());
    if (typeof data.conversationId !== 'string' || typeof data.messageId !== 'string') throw ghlUpstream();
    return { conversationId: data.conversationId, messageId: data.messageId, status: optionalString(data.status) };
  }

  async listCalendars(account: GhlConfig = this.client.config()): Promise<GhlCalendar[]> {
    const data = await this.client.request({
      method: 'GET', path: '/calendars/', version: GHL_VERSION.calendars, query: { locationId: account.locationId, showDrafted: 'false' },
    }, account);
    if (!Array.isArray(data.calendars)) throw ghlUpstream();
    return data.calendars.filter(isRecord).filter(calendar => typeof calendar.id === 'string').map(calendar => ({
      id: calendar.id as string,
      name: typeof calendar.name === 'string' ? calendar.name : '',
      description: optionalString(calendar.description),
      isActive: calendar.isActive !== false,
      slotDuration: typeof calendar.slotDuration === 'number' ? calendar.slotDuration : null,
      slotDurationUnit: optionalString(calendar.slotDurationUnit),
    }));
  }

  async availability(calendarId: string, startDate: unknown, endDate: unknown, timezone?: unknown, account?: GhlConfig): Promise<GhlAvailability> {
    assertGhlId(calendarId, 'calendar ID');
    const start = parseIsoDate(startDate, 'availability range');
    const end = parseIsoDate(endDate, 'availability range');
    if (end < start || (end - start) / DAY_MS >= MAX_RANGE_DAYS) throw invalid('availability range');
    const zone = timezone === undefined ? null : canonicalTimeZone(timezone);
    if (timezone !== undefined && !zone) throw invalid('timezone');
    const data = await this.client.request({
      method: 'GET', path: `/calendars/${calendarId}/free-slots`, version: GHL_VERSION.calendars,
      query: { startDate: String(start), endDate: String(end + DAY_MS - 1), ...(zone ? { timezone: zone } : {}) },
    }, account ?? this.client.config());
    const days = Object.entries(data)
      .filter(([date, value]) => DATE.test(date) && isRecord(value) && Array.isArray(value.slots))
      .map(([date, value]) => ({ date, slots: ((value as { slots: unknown[] }).slots).filter((slot): slot is string => typeof slot === 'string') }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return { calendarId, timezone: zone, days };
  }
}
