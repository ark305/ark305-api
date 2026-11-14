import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { ProfileInput, ProfilesPort, ProviderApplication, ProviderApplicationStatus } from './profiles.port.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES: ProviderApplicationStatus[] = ['pending', 'approved', 'rejected'];
const DECISIONS: Record<string, boolean> = { approve: true, reject: false };

@Injectable()
export class ProviderApprovalService {
  constructor(private readonly profiles: ProfilesPort) {}

  /** A self-service profile write may never grant `provider`; it files an application instead. */
  gateKind(value: ProfileInput, currentKind: unknown): { value: ProfileInput; requested: boolean } {
    if (value.kind !== 'provider' || currentKind === 'provider') return { value, requested: false };
    const kept = typeof currentKind === 'string' && currentKind ? currentKind : 'member';
    return { value: { ...value, kind: kept }, requested: true };
  }

  async apply(token: string, userId: string): Promise<ProviderApplication> {
    const profile = await this.profiles.findOwn(token, userId);
    if (!profile) throw new BadRequestException('Profile required');
    if (profile.kind === 'provider') throw new ConflictException('Already a provider');
    const application = await this.profiles.requestProviderRole(token);
    if (!application || application.userId !== userId) throw new ServiceUnavailableException('Profile storage unavailable');
    return application;
  }

  async list(token: string, viewerId: string, status: unknown = 'pending'): Promise<ProviderApplication[]> {
    const value = status === undefined || status === '' ? 'pending' : status;
    if (!STATUSES.includes(value as ProviderApplicationStatus)) throw new BadRequestException('Invalid application status');
    await this.requireOperator(token, viewerId);
    return this.profiles.listProviderApplications(token, value as ProviderApplicationStatus);
  }

  async decide(token: string, viewerId: string, applicantId: string, decision: string): Promise<ProviderApplication> {
    if (!UUID.test(applicantId) || !(decision in DECISIONS)) throw new BadRequestException('Invalid provider decision');
    await this.requireOperator(token, viewerId);
    const application = await this.profiles.decideProviderApplication(token, applicantId.toLowerCase(), DECISIONS[decision]);
    if (!application) throw new NotFoundException('No pending provider application');
    if (application.userId !== applicantId.toLowerCase()) throw new ServiceUnavailableException('Profile storage unavailable');
    return application;
  }

  private async requireOperator(token: string, userId: string) {
    if (!await this.profiles.isOperator(token, userId)) throw new ForbiddenException('Operator access required');
  }
}
