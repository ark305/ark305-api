/** What anyone may see about a provider's GHL connection; the token is never part of it. */
export type GhlAccountStatus = {
  providerId: string;
  connected: boolean;
  locationId: string | null;
  pipelineId: string | null;
  pipelineStageId: string | null;
  connectedAt: string | null;
  updatedAt: string | null;
};

/** Server-side only: the sealed token plus where it applies. */
export type GhlStoredCredentials = {
  locationId: string;
  pipelineId: string | null;
  pipelineStageId: string | null;
  tokenCiphertext: string;
};

export type GhlAccountWrite = GhlStoredCredentials & { providerId: string };

export abstract class GhlAccountsPort {
  abstract profileKind(token: string, userId: string): Promise<string | null>;
  abstract credentials(token: string, providerId: string): Promise<GhlStoredCredentials | null>;
  abstract save(token: string, account: GhlAccountWrite): Promise<GhlAccountStatus>;
  abstract remove(token: string, providerId: string): Promise<void>;
  abstract status(token: string, providerId: string): Promise<GhlAccountStatus | null>;
  abstract list(token: string): Promise<GhlAccountStatus[]>;
}
