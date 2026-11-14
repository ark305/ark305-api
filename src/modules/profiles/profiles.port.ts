export type ProfileInput = Record<string, unknown>;
export type ProfileRecord = Record<string, unknown> & { id: string; handle: string };
export type ServiceInput = Record<string, unknown>;
export type ServiceRecord = Record<string, unknown> & { id: string; owner: string };

export type ProviderApplicationStatus = 'pending' | 'approved' | 'rejected';
export type ProviderApplication = {
  userId: string;
  status: ProviderApplicationStatus;
  requestedAt: string;
  decidedAt: string | null;
  profile?: { handle: string; name: string; kind: string } | null;
};

export abstract class ProfilesPort {
  abstract findOwn(token: string, ownerId: string): Promise<ProfileRecord | null>;
  abstract findPublic(token: string, handle: string): Promise<ProfileRecord | null>;
  abstract recent(token: string, limit: number): Promise<ProfileRecord[]>;
  abstract handleTaken(token: string, handle: string, excludeId?: string): Promise<boolean>;
  abstract createProfile(token: string, ownerId: string, value: ProfileInput): Promise<ProfileRecord | null>;
  abstract updateProfile(token: string, ownerId: string, value: ProfileInput): Promise<ProfileRecord | null>;
  abstract listServices(token: string, ownerId: string): Promise<ServiceRecord[]>;
  abstract saveService(token: string, ownerId: string, id: string | undefined, value: ServiceInput): Promise<ServiceRecord | null>;
  abstract deleteService(token: string, ownerId: string, id: string): Promise<void>;
  abstract updateOwn(token: string, ownerId: string, value: ProfileInput): Promise<boolean>;
  abstract isOperator(token: string, userId: string): Promise<boolean>;
  abstract findProviderApplication(token: string, userId: string): Promise<ProviderApplication | null>;
  abstract requestProviderRole(token: string): Promise<ProviderApplication | null>;
  abstract listProviderApplications(token: string, status: ProviderApplicationStatus): Promise<ProviderApplication[]>;
  abstract decideProviderApplication(token: string, applicantId: string, approve: boolean): Promise<ProviderApplication | null>;
}
