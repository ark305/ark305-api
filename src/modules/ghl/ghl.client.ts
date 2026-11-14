import { HttpException, Injectable } from '@nestjs/common';
import { GhlConfig, getGhlBaseUrl, getGhlConfig } from './ghl-config.js';

// API v2 version headers documented per resource in GoHighLevel/highlevel-api-docs.
export const GHL_VERSION = { contacts: '2021-07-28', opportunities: '2021-07-28', conversations: '2021-04-15', calendars: '2021-04-15' } as const;

export type GhlRequest = {
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  version: (typeof GHL_VERSION)[keyof typeof GHL_VERSION];
  query?: Record<string, string>;
  body?: Record<string, unknown>;
};

export const ghlNotConfigured = () => new HttpException({ error: 'ghl_not_configured' }, 503);
export const ghlUpstream = () => new HttpException({ error: 'ghl_upstream' }, 502);
const rateLimited = () => new HttpException({ error: 'rate_limited' }, 429);
// GHL answers a bad, revoked or wrong-location token with one of these.
const REJECTED_CREDENTIALS = new Set([400, 401, 403, 404, 422]);

@Injectable()
export class GhlClient {
  /** ARK's own account from the environment. */
  config(): GhlConfig {
    const config = getGhlConfig();
    if (!config) throw ghlNotConfigured();
    return config;
  }

  baseUrl(): URL {
    const baseUrl = getGhlBaseUrl();
    if (!baseUrl) throw ghlNotConfigured();
    return baseUrl;
  }

  async request(request: GhlRequest, config: GhlConfig = this.config()): Promise<Record<string, unknown>> {
    const response = await this.send(request, config.apiKey, config.baseUrl);
    if (response.status === 429) throw rateLimited();
    if (!response.ok) throw ghlUpstream();
    return this.json(response);
  }

  /** Cheap read with a candidate token (the calendars scope the module already needs); false when GHL rejects it. */
  async verifyCredentials(apiKey: string, locationId: string): Promise<boolean> {
    const response = await this.send({
      method: 'GET', path: '/calendars/', version: GHL_VERSION.calendars, query: { locationId, showDrafted: 'false' },
    }, apiKey, this.baseUrl());
    if (response.status === 429) throw rateLimited();
    if (REJECTED_CREDENTIALS.has(response.status)) return false;
    if (!response.ok) throw ghlUpstream();
    return Array.isArray((await this.json(response)).calendars);
  }

  private async send(request: GhlRequest, apiKey: string, baseUrl: URL): Promise<Response> {
    const url = new URL(request.path, baseUrl);
    for (const [key, value] of Object.entries(request.query ?? {})) url.searchParams.set(key, value);
    try {
      return await fetch(url, {
        method: request.method,
        headers: {
          Authorization: `Bearer ${apiKey}`, Version: request.version, Accept: 'application/json',
          ...(request.body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
        signal: AbortSignal.timeout(10000), redirect: 'error', cache: 'no-store',
      });
    } catch {
      throw ghlUpstream();
    }
  }

  // Provider bodies may echo contact data; only fixed error codes leave this layer.
  private async json(response: Response): Promise<Record<string, unknown>> {
    let data: unknown;
    try { data = await response.json(); } catch { throw ghlUpstream(); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw ghlUpstream();
    return data as Record<string, unknown>;
  }
}
