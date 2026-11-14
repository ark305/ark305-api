import { Module } from '@nestjs/common';
import { ProfilesController } from './profiles.controller.js';
import { ProfilesPort } from './profiles.port.js';
import { ProviderApprovalService } from './provider-approval.service.js';
import { SupabaseProfilesAdapter } from './supabase-profiles.adapter.js';

@Module({
  controllers: [ProfilesController],
  providers: [{ provide: ProfilesPort, useClass: SupabaseProfilesAdapter }, ProviderApprovalService],
  exports: [ProfilesPort],
})
export class ProfilesModule {}
