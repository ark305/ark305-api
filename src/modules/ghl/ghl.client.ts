import { HttpException, Injectable } from '@nestjs/common';
import { GhlConfig, getGhlConfig } from './ghl-config.js';

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

@Injectable()
export class GhlClient {
  config(): GhlConfig {
    const config = getGhlConfig();
    if (!config) throw ghlNotConfigured();
    return config;
  }

  async request(request: GhlRequest): Promise<Record<string, unknown>> {
    const { apiKey, baseUrl } = this.config();
    const url = new URL(request.path, baseUrl);
    for (const [key, value] of Object.entries(request.query ?? {})) url.searchParams.set(key, value);
    try {
      const response = await fetch(url, {
        method: request.method,
        headers: {
          Authorization: `Bearer ${apiKey}`, Version: request.version, Accept: 'application/json',
          ...(request.body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
        signal: AbortSignal.timeout(10000), redirect: 'error', cache: 'no-store',
      });
      if (response.status === 429) throw new HttpException({ error: 'rate_limited' }, 429);
      if (!response.ok) throw ghlUpstream();
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw ghlUpstream();
      return data as Record<string, unknown>;
    } catch (error) {
      // Provider bodies may echo contact data; only fixed error codes leave this layer.
      if (error instanceof HttpException) throw error;
      throw ghlUpstream();
    }
  }
}
