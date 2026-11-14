import { BadRequestException, ForbiddenException, HttpException, Injectable } from '@nestjs/common';
import { GHL_ID, GhlConfig, getGhlConfig } from './ghl-config.js';
import { ghlCredentialsKeyConfigured, openGhlToken, sealGhlToken } from './ghl-credentials.js';
import { GhlAccountStatus, GhlAccountsPort } from './ghl-accounts.port.js';
import { GhlAccess } from './ghl-access.js';
import { GhlClient } from './ghl.client.js';

export type GhlAccountInput = { locationId: string; token: string; pipelineId: string | null; pipelineStageId: string | null };
/** `write`: contacts, opportunities, messages. `read`: calendars and availability. */
export type GhlActingMode = 'write' | 'read';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[\x21-\x7e]{16,4096}$/;
const ACCOUNT_FIELDS = ['locationId', 'token', 'pipelineId', 'pipelineStageId'];

export const ghlCredentialsUnavailable = () => new HttpException({ error: 'ghl_credentials_unavailable' }, 503);
const invalidAccount = () => new BadRequestException('Invalid GoHighLevel account');

export function parseAccountInput(body: unknown): GhlAccountInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw invalidAccount();
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some(key => !ACCOUNT_FIELDS.includes(key))) throw invalidAccount();
  if (typeof value.locationId !== 'string' || !GHL_ID.test(value.locationId.trim())) throw invalidAccount();
  if (typeof value.token !== 'string' || !TOKEN.test(value.token.trim())) throw invalidAccount();
  const optionalId = (id: unknown) => {
    if (id === undefined || id === null || id === '') return null;
    if (typeof id !== 'string' || !GHL_ID.test(id.trim())) throw invalidAccount();
    return id.trim();
  };
  const pipelineId = optionalId(value.pipelineId);
  const pipelineStageId = optionalId(value.pipelineStageId);
  if (pipelineStageId && !pipelineId) throw invalidAccount();
  return { locationId: value.locationId.trim(), token: value.token.trim(), pipelineId, pipelineStageId };
}

export function parseProviderId(value: unknown): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !UUID.test(value)) throw new BadRequestException('Invalid provider ID');
  return value.toLowerCase();
}

const disconnected = (providerId: string): GhlAccountStatus =>
  ({ providerId, connected: false, locationId: null, pipelineId: null, pipelineStageId: null, connectedAt: null, updatedAt: null });

@Injectable()
export class GhlAccountsService {
  constructor(private readonly client: GhlClient, private readonly access: GhlAccess, private readonly accounts: GhlAccountsPort) {}

  /** A provider connects their own sub-account; the token is checked against GHL before it is sealed and stored. */
  async connect(token: string, userId: string, input: GhlAccountInput): Promise<GhlAccountStatus> {
    if (!ghlCredentialsKeyConfigured()) throw ghlCredentialsUnavailable();
    if (await this.accounts.profileKind(token, userId) !== 'provider') throw new ForbiddenException('Provider profile required');
    if (!await this.client.verifyCredentials(input.token, input.locationId)) {
      throw new HttpException({ error: 'ghl_invalid_credentials' }, 400);
    }
    return this.accounts.save(token, {
      providerId: userId, locationId: input.locationId, pipelineId: input.pipelineId, pipelineStageId: input.pipelineStageId,
      tokenCiphertext: sealGhlToken(input.token, userId, input.locationId),
    });
  }

  async disconnect(token: string, userId: string): Promise<GhlAccountStatus> {
    await this.accounts.remove(token, userId);
    return disconnected(userId);
  }

  async ownStatus(token: string, userId: string): Promise<GhlAccountStatus> {
    return await this.accounts.status(token, userId) ?? disconnected(userId);
  }

  async providerStatus(token: string, viewerId: string, providerId: unknown): Promise<GhlAccountStatus> {
    const id = parseProviderId(providerId);
    if (!id) throw new BadRequestException('Invalid provider ID');
    await this.access.requireOperator(token, viewerId);
    return await this.accounts.status(token, id) ?? disconnected(id);
  }

  async list(token: string, viewerId: string): Promise<GhlAccountStatus[]> {
    await this.access.requireOperator(token, viewerId);
    return this.accounts.list(token);
  }

  /**
   * Picks the GHL account a call runs against. Without `providerId` nothing changes: ARK's env account, writes for operators only.
   * With `providerId`, the provider's connected account is used; writes need the provider themself or an operator.
   * A provider without a connection falls back to ARK's account for reads, and for writes only when an operator asks.
   * `undefined` means ARK's own account, resolved by GhlService when the call is made.
   */
  async resolve(token: string, viewerId: string, providerId: unknown, mode: GhlActingMode): Promise<GhlConfig | undefined> {
    const id = parseProviderId(providerId);
    if (!id) {
      if (mode === 'write') await this.access.requireOperator(token, viewerId);
      return undefined;
    }
    let operator = false;
    if (mode === 'write' && id !== viewerId) {
      await this.access.requireOperator(token, viewerId);
      operator = true;
    }
    const stored = await this.accounts.credentials(token, id);
    if (!stored) {
      if (mode === 'write' && !operator && !await this.access.isOperator(token, viewerId)) {
        throw new HttpException({ error: 'ghl_account_not_connected' }, 409);
      }
      return undefined;
    }
    const apiKey = openGhlToken(stored.tokenCiphertext, id, stored.locationId);
    if (!apiKey) throw ghlCredentialsUnavailable();
    // Pipeline IDs belong to a location, so ARK's default pipeline only applies when the provider uses ARK's location.
    const fallback = stored.pipelineId ? null : getGhlConfig();
    const sameLocation = fallback?.locationId === stored.locationId;
    return {
      apiKey, locationId: stored.locationId, baseUrl: this.client.baseUrl(),
      pipelineId: stored.pipelineId ?? (sameLocation ? fallback?.pipelineId : undefined),
      pipelineStageId: stored.pipelineId ? stored.pipelineStageId ?? undefined : sameLocation ? fallback?.pipelineStageId : undefined,
    };
  }
}
