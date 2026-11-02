import { Module } from '@nestjs/common';
import { ProfilesController } from './profiles.controller';
import { ProfilesPort } from './profiles.port';
import { SupabaseProfilesAdapter } from './supabase-profiles.adapter';

@Module({
  controllers: [ProfilesController],
  providers: [{ provide: ProfilesPort, useClass: SupabaseProfilesAdapter }],
})
export class ProfilesModule {}
