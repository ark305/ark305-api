import { Module } from '@nestjs/common';
import { ProfilesController } from './profiles.controller.js';
import { ProfilesPort } from './profiles.port.js';
import { SupabaseProfilesAdapter } from './supabase-profiles.adapter.js';

@Module({
  controllers: [ProfilesController],
  providers: [{ provide: ProfilesPort, useClass: SupabaseProfilesAdapter }],
  exports: [ProfilesPort],
})
export class ProfilesModule {}
